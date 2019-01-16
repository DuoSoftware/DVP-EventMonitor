﻿var esl = require('modesl');
var redis = require('ioredis');
var querystring = require('querystring');
var http = require('http');
var config = require('config');
var colors = require('colors');
var util = require('util');
var request = require('request');
var amqp = require('amqp');
var fs = require('fs');
var os = require('os');
var nodeUuid = require('node-uuid');
var logger = require('dvp-common/LogHandler/CommonLogHandler.js').logger;
var extApiAccess = require('./ExternalApiAccess.js');
var tcpp = require('tcp-ping');
var moment = require('moment');
var dbOp = require('./DbOperationsHandler.js');
var ardsHandler = require('./ArdsResourceStateHandler.js');
var redisHandler = require('./RedisHandler.js');
var mongoAccessor = require('./MongoAccessor.js');
var _ = require('lodash');
var mailSender = require('./MailSender.js').PublishToQueue;
var dashboardEvtHandler = require('./DashboardEventHandler.js');
var dvpEventHandler = require('./DVPEventPublisher.js');

var winston = require('winston');

var loggerCust = new winston.Logger();

var level = 'debug';

loggerCust.add(winston.transports.File, {filename: 'logs/common_logger.log', level: level, maxsize:1242880, maxFiles:10});

//open a connection

var freeswitchIp = config.Freeswitch.ip;
var fsPort = config.Freeswitch.port;
var fsPassword = config.Freeswitch.password;
var fsHttpPort = config.Freeswitch.httport;




//
//var redisPort = config.Redis.port;
//var redisIp = config.Redis.ip;
//var redisPass = config.Redis.password;
//
//var redisClient = redis.createClient(redisPort,redisIp);
//
//redisClient.auth(redisPass, function (err) {
//    console.log("Error Authenticating Redis : " + err);
//});



////////////////////////////////redis////////////////////////////////////////
var redisip = config.Redis.ip;
var redisport = config.Redis.port;
var redispass = config.Redis.password;
var redismode = config.Redis.mode;
//var redisdb = config.Redis.db;


//[redis:]//[user][:password@][host][:port][/db-number][?db=db-number[&password=bar[&option=value]]]
//redis://user:secret@localhost:6379
var redisSetting =  {
    port:redisport,
    host:redisip,
    family: 4,
    //db: redisdb,
    password: redispass,
    retryStrategy: function (times) {
        var delay = Math.min(times * 50, 2000);
        return delay;
    },
    reconnectOnError: function (err) {

        return true;
    }
};

if(redismode == 'sentinel'){

    if(config.Redis.sentinels && config.Redis.sentinels.hosts && config.Redis.sentinels.port && config.Redis.sentinels.name){
        var sentinelHosts = config.Redis.sentinels.hosts.split(',');
        if(Array.isArray(sentinelHosts) && sentinelHosts.length > 2){
            var sentinelConnections = [];

            sentinelHosts.forEach(function(item){

                sentinelConnections.push({host: item, port:config.Redis.sentinels.port})

            })

            redisSetting = {
                sentinels:sentinelConnections,
                name: config.Redis.sentinels.name,
                password: redispass
            }

        }else{

            console.log("No enough sentinel servers found .........");
        }

    }
}

var redisClient = undefined;

if(redismode != "cluster") {
    redisClient = new redis(redisSetting);
}else{

    var redisHosts = redisip.split(",");
    if(Array.isArray(redisHosts)){


        redisSetting = [];
        redisHosts.forEach(function(item){
            redisSetting.push({
                host: item,
                port: redisport,
                family: 4,
                password: redispass});
        });

        var redisClient = new redis.Cluster([redisSetting]);

    }else{

        redisClient = new redis(redisSetting);
    }
}





var evtConsumeType = config.evtConsumeType;
console.log('EVENT CONSUME TYPE : ' + evtConsumeType);


//var rmqIp = config.RabbitMQ.ip;
//var rmqPort = config.RabbitMQ.port;
//var rmqUser = config.RabbitMQ.user;
//var rmqPassword = config.RabbitMQ.password;


redisClient.on('error',function(err){

});


var redisMessageHandler = function (err, reply)
{
    if (err)
    {
        logger.error('[DVP-EventMonitor.handler] - REDIS ERROR', err);
    }
};

var sendMailSMS = function(reqId, companyId, tenantId, email, message, smsnumber)
{
    var sendObj = {
        "company": companyId,
        "tenant": tenantId
    };

    sendObj.from = "facetone_gw_availability";
    sendObj.subject = "Gateway Down";
    sendObj.body = message;

    if(email)
    {
        sendObj.to = email;
        mailSender("EMAILOUT", sendObj);

    }

    if(smsnumber)
    {
        sendObj.to = smsnumber;
        mailSender("SMSOUT", sendObj);

    }


};

var notifyGatewayStatus = function(reqId, status, evtObj)
{
    mongoAccessor.getSuperUsers(function(err, usrData)
    {
        if(usrData && usrData.length > 0)
        {
            var issuers = _.map(usrData, 'username');
            var nsObj = {
                Ref: evtObj['Gateway'],
                clients: issuers,
                Timeout: 1000,
                Direction: 'STATELESS',
                From: 'CALLSERVER',
                Callback: '',
                Message: JSON.stringify(evtObj)
            };

            extApiAccess.SendNotificationBroadcast(reqId, status, evtObj['Gateway'], nsObj, usrData[0].company, usrData[0].tenant);

            if(status === 'gateway_state' && evtObj['Ping-Status'] === 'DOWN')
            {
                usrData.forEach(function(superuser)
                {
                    if(superuser.username)
                    {
                        if(superuser.email && superuser.email.contact)
                        {
                            sendMailSMS(reqId, superuser.company, superuser.tenant, superuser.email.contact, evtObj['Gateway'] + ' Gateway is DOWN at '  + evtObj['Event-Date-GMT'], null);
                        }

                        if(superuser.phoneNumber && superuser.phoneNumber.contact)
                        {
                            sendMailSMS(reqId, superuser.company, superuser.tenant, null, evtObj['Gateway'] + ' Gateway is DOWN at ' + evtObj['Event-Date-GMT'], superuser.phoneNumber.contact);
                        }


                    }

                });
            }

        }
        else
        {
            logger.debug('[DVP-EventMonitor.handler] - [%s] - No superusers to broadcast message', reqId);
        }

    });
};

var eventHandler = function(reqId, evtObj)
{
    var evtType = evtObj['Event-Name'];
    var uniqueId = evtObj['Unique-ID'];
    var customCompanyStr = evtObj['variable_CustomCompanyStr'];
    var dvpCustPubId = evtObj['variable_DVP_CUSTOM_PUBID'];
    var dialerAgentEvtPub = evtObj['variable_DIALER_AGENT_EVENT'];
    var campaignId = evtObj['variable_CampaignId'];
    var companyId = evtObj['variable_companyid'];
    var tenantId = evtObj['variable_tenantid'];
    var bUnit = evtObj['variable_business_unit'];

    if(!bUnit)
    {
        bUnit = 'default';
    }
    var operator = evtObj['variable_veeryoperator'];
    var variableEvtTime = evtObj["Event-Date-Timestamp"];
    var switchName = evtObj['FreeSWITCH-Switchname'];
    var freeswitchHostname = evtObj['FreeSWITCH-Hostname'];
    var chanCountInstance = 'DVP_CHANNEL_COUNT_INSTANCE:' + switchName;
    var callCountInstance = 'DVP_CALL_COUNT_INSTANCE:' + switchName;
    var callCountCompany = 'DVP_CALL_COUNT_COMPANY:' + tenantId + ':' + companyId;
    var chanCountCompany = 'DVP_CHANNEL_COUNT_COMPANY:' + tenantId + ':' + companyId;
    var callerDestNum = evtObj['Caller-Destination-Number'];
    var ardsAction = evtObj['ARDS-Action'];
    var ardsClientUuid = evtObj['ards_client_uuid'];
    var dvpAppId = evtObj['variable_dvp_app_id'];
    var appType = evtObj['variable_application_type'];
    var appPosition = evtObj['variable_application_position'];
    var callerIdNum = evtObj['Caller-Caller-ID-Number'];
    var callerIdName = evtObj['Caller-Caller-ID-Name'];
    var direction = evtObj['Call-Direction'];
    var dvpCallDirection = evtObj['variable_DVP_CALL_DIRECTION'];
    var callMonitorOtherLeg = evtObj['variable_DVP_CALLMONITOR_OTHER_LEG'];
    var otherLegUniqueId = evtObj['Other-Leg-Unique-ID'];
    var callerOrigIdName = evtObj['Caller-Orig-Caller-ID-Name'];
    var callerOrigIdNumber = evtObj['Caller-Orig-Caller-ID-Number'];
    var opCat = evtObj['variable_DVP_OPERATION_CAT'];
    var actionCat = evtObj['variable_DVP_ACTION_CAT'];
    var resourceId = evtObj['variable_ARDS-Resource-Id'];
    var callerContext = evtObj['Caller-Context'];
    var calleeNumber = evtObj['Caller-Callee-ID-Number'];
    var isDialerIVR = evtObj['variable_is_dialer_ivr'];
    var transCallSkill = evtObj['variable_transfer_call_skill'];
    var listenCallSkill = evtObj['variable_listen_skill_data'];
    var callLegType = evtObj['variable_CALL_LEG_TYPE'];


    if(!callerOrigIdName)
    {
        callerOrigIdName = evtObj['Other-Leg-Caller-ID-Number'];
    }

    //loggerCust.debug('EVENT RECEIVED - [UUID : %s , TYPE : %s, CompanyId : %s', uniqueId, evtType, companyId);



    //fs.appendFile("D:/DVP/log.txt", evtType + ':' + event.getHeader('Channel-State') + ':' + event.getHeader('Call-Direction') + ':' + companyId + '\r\n', function(err) {
    //    if(err) {
    //        return console.log(err);
    //    }
    //
    //    console.log("The file was saved!");
    //});

    if(evtType === 'CHANNEL_BRIDGE' || evtType === 'CHANNEL_CALLSTATE' || evtType === 'CHANNEL_CREATE' || evtType === 'CHANNEL_STATE' || evtType === 'CHANNEL_ANSWER')
    {
        if(dvpCallDirection)
        {
            redisClient.hset(uniqueId, 'DVP-Call-Direction', dvpCallDirection, function (err, reply){
                redisClient.expire(uniqueId, 86400, redisMessageHandler);
            });
        }

        if(companyId && tenantId)
        {
            redisClient.hset(uniqueId, 'DVP-CompanyId', companyId, function (err, reply){
                redisClient.expire(uniqueId, 86400, redisMessageHandler);
            });

            redisClient.hset(uniqueId, 'DVP-TenantId', tenantId, function (err, reply){
                redisClient.expire(uniqueId, 86400, redisMessageHandler);
            });
        }

        if(evtType === 'CHANNEL_ANSWER')
        {
            if(bUnit)
            {
                redisClient.hset(uniqueId, 'DVP-Business-Unit', bUnit, function (err, reply){
                    redisClient.expire(uniqueId, 86400, redisMessageHandler);
                });
            }
        }

        if(resourceId)
        {
            redisClient.hset(uniqueId, 'Agent-Resource-Id', resourceId, function (err, reply){
                redisClient.expire(uniqueId, 86400, redisMessageHandler);
            });
        }


        if(appType)
        {
            redisClient.hset(uniqueId, 'Application-Type', appType, function (err, reply){
                redisClient.expire(uniqueId, 86400, redisMessageHandler);
            });
        }

        if(appPosition)
        {
            redisClient.hset(uniqueId, 'Application-Position', appPosition, function (err, reply){
                redisClient.expire(uniqueId, 86400, redisMessageHandler);
            });
        }


    }

    var eventTime = '';

    if(ardsClientUuid)
    {
        uniqueId = ardsClientUuid;
    }

    if(evtType === 'CHANNEL_BRIDGE' || evtType === 'CHANNEL_CREATE' || evtType === 'CHANNEL_ANSWER' || evtType === 'ARDS_EVENT' || evtType === 'CHANNEL_HOLD' || evtType === 'CHANNEL_UNHOLD' || evtType === 'CHANNEL_UNBRIDGE' || evtType === 'CHANNEL_DESTROY' || evtType === 'CHANNEL_HANGUP')
    {
        logger.debug('[DVP-EventMonitor.handler] - [%s] - Event Data - EVENT_TYPE : ' + evtType + ', CHANNEL_STATE : ' + evtObj['Channel-State'] + ', SESSION_ID : ' + uniqueId + ', CALLER_UUID : ' + evtObj['Caller-Unique-ID'] + 'SWITCH HOST NAME : ' + freeswitchHostname, reqId);

        //logger.debug('[DVP-EventMonitor.handler] - [%s] - RAW EVENT JSON TYPE %s : %s', reqId, evtType, JSON.stringify(evtObj));
    }

    if (variableEvtTime)
    {

        var utcSeconds = parseInt(variableEvtTime)/1000000;
        var d = new Date(0); // The 0 there is the key, which sets the date to the epoch
        d.setUTCSeconds(utcSeconds);
        eventTime = d.toISOString();
    }

    var evtData =
        {
            SessionId: uniqueId,
            EventClass: "CALL",
            EventType: "CHANNEL",
            EventTime: eventTime,
            EventName: evtType,
            EventData: uniqueId,
            AuthData: customCompanyStr,
            SwitchName: switchName,
            FSHostName: freeswitchHostname,
            CampaignId: campaignId,
            CallerDestNum: callerDestNum,
            EventParams: "",
            CompanyId: companyId,
            TenantId: tenantId,
            BusinessUnit: bUnit
        };

    if(evtType === 'CHANNEL_BRIDGE' || evtType === 'CHANNEL_CREATE' || evtType === 'CHANNEL_ANSWER' || evtType === 'CHANNEL_DESTROY' || evtType === 'CHANNEL_HANGUP')
    {
        if(dialerAgentEvtPub)
        {
            var agentEvt = {
                SessionId: uniqueId,
                EventClass: "CALL",
                EventType: "CHANNEL",
                EventTime: eventTime,
                EventName: evtType,
                EventData: uniqueId,
                AuthData: customCompanyStr,
                SwitchName: switchName,
                FSHostName: freeswitchHostname,
                CampaignId: campaignId,
                CallerDestNum: callerDestNum,
                EventParams: "",
                CompanyId: companyId,
                TenantId: tenantId,
                BusinessUnit: bUnit
            };

            if(!ardsClientUuid && evtObj['variable_ards_client_uuid'])
            {
                agentEvt.SessionId = evtObj['variable_ards_client_uuid'];
            }

            agentEvt.DisconnectReason = evtObj['Hangup-Cause'];

            jsonStr = JSON.stringify(agentEvt);

            logger.debug('[DVP-EventMonitor.handler] - [%s] - REDIS PUBLISH DIALER AGENT CHANNEL : %s, DATA: %s', reqId, dialerAgentEvtPub, jsonStr);

            redisClient.publish(dialerAgentEvtPub, jsonStr);
        }
    }

    switch (evtType)
    {
        case 'ARDS_EVENT':

            evtData.EventCategory = ardsAction;

            var jsonStr = JSON.stringify(evtData);

            if(dvpCustPubId)
            {
                redisClient.publish(dvpCustPubId, jsonStr);
                logger.debug('[DVP-EventMonitor.handler] - [%s] - REDIS PUBLISH CUSTOM: %s', reqId, jsonStr);
            }
            else
            {
                dvpEventHandler.PublishDVPEventsMessage(evtData);
                //redisClient.publish('SYS:MONITORING:DVPEVENTS', jsonStr);
                //logger.debug('[DVP-EventMonitor.handler] - [%s] - REDIS PUBLISH DVPEVENTS: %s', reqId, jsonStr);
            }

            redisClient.hset(uniqueId, 'ARDS-State', ardsAction, redisMessageHandler);
            break;

        case 'OUTGOING_CHANNEL':

            break;

        case 'CHANNEL_BRIDGE':

            redisClient.incr(callCountInstance, redisMessageHandler);
            redisClient.incr(callCountCompany, redisMessageHandler);

            var resId = evtObj['variable_ards_resource_id'];
            var skillAgent = evtObj['variable_ards_skill_display'];
            var channelBridgeTimeStamp = evtObj['Caller-Channel-Bridged-Time'];
            var varArdsClientUuid = evtObj['variable_ards_client_uuid'];
            var otherLegDir = evtObj['Other-Leg-Direction'];

            if (channelBridgeTimeStamp)
            {
                var dt = new Date(0); // The 0 there is the key, which sets the date to the epoch
                dt.setUTCSeconds(parseInt(channelBridgeTimeStamp)/1000000);
                redisClient.hset(uniqueId, 'CHANNEL-BRIDGE-TIME', dt.toISOString(), redisMessageHandler);
            }

            if((opCat === 'ATT_XFER_USER' || opCat === 'ATT_XFER_GATEWAY') && tenantId && companyId && resId && varArdsClientUuid && otherLegDir === 'outbound')
            {
                dashboardEvtHandler.PublishDashboardMessage(tenantId, companyId, bUnit, "CALLSERVER", "CALL", "TRANSFER", varArdsClientUuid, resId, '', eventTime);
                /*var pubMessage = util.format("EVENT:%s:%s:%s:%s:%s:%s:%s:%s:YYYY", tenantId, companyId, "CALLSERVER", "CALL", "TRANSFER", resId, '', varArdsClientUuid);

                redisClient.publish('events', pubMessage);*/
            }


            if(dvpCallDirection)
            {
                var otherLegCallerIdNumber = evtObj['Other-Leg-Caller-ID-Number'];
                var otherLegCalleeIdNumber = evtObj['Other-Leg-Callee-ID-Number'];
                var otherLegContext = evtObj['Other-Leg-Context'];

                if(opCat === 'ATT_XFER_GATEWAY' && otherLegContext === 'PBXFeatures' && otherLegCalleeIdNumber && otherLegCallerIdNumber && dvpCallDirection === 'outbound' && operator)
                {
                    extApiAccess.BillCall(reqId, uniqueId, otherLegCallerIdNumber, otherLegCalleeIdNumber, 'minute', operator, companyId, tenantId);

                }

                if(opCat === 'GATEWAY' && otherLegCalleeIdNumber && otherLegCallerIdNumber && dvpCallDirection === 'outbound' && operator)
                {
                    extApiAccess.BillCall(reqId, uniqueId, otherLegCallerIdNumber, otherLegCalleeIdNumber, 'minute', operator, companyId, tenantId);

                }

                var callCountCompanyDir = 'DVP_CALL_COUNT_COMPANY_DIR:' + tenantId + ':' + companyId + ':' + dvpCallDirection;

                redisClient.incr(callCountCompanyDir, redisMessageHandler);

            }

            var bridgeDashboardUid = uniqueId;

            if(evtObj['Bridge-B-Unique-ID'])
            {
                bridgeDashboardUid = evtObj['Bridge-B-Unique-ID'];
            }

            dashboardEvtHandler.PublishDashboardMessage(tenantId, companyId, bUnit, "CALLSERVER", "CALL", "BRIDGE", bridgeDashboardUid, '', dvpCallDirection, eventTime);

            /*var pubMessage = util.format("EVENT:%s:%s:%s:%s:%s:%s:%s:%s:YYYY", tenantId, companyId, "CALLSERVER", "CALL", "BRIDGE", "", dvpCallDirection, bridgeDashboardUid);

            redisClient.publish('events', pubMessage);*/


            evtData.EventCategory = "CHANNEL_BRIDGE";

            var jsonStr = '';

            if(dvpCustPubId)
            {
                if(!ardsClientUuid && evtObj['variable_ards_client_uuid'])
                {
                    evtData.SessionId = evtObj['variable_ards_client_uuid'];
                }

                jsonStr = JSON.stringify(evtData);

                logger.debug('[DVP-EventMonitor.handler] - [%s] - REDIS PUBLISH CUSTOM: %s', reqId, jsonStr);

                redisClient.publish(dvpCustPubId, jsonStr);
            }
            else
            {
                dvpEventHandler.PublishDVPEventsMessage(evtData);
                /*jsonStr = JSON.stringify(evtData);
                redisClient.publish('SYS:MONITORING:DVPEVENTS', jsonStr);*/
            }

            redisClient.hset(uniqueId, 'Bridge-State', 'Bridged', redisMessageHandler);
            redisClient.hset(uniqueId, 'ARDS-Skill-Display', skillAgent, redisMessageHandler);

            if(otherLegUniqueId)
            {
                redisClient.hset(uniqueId, 'Other-Leg-Unique-ID', otherLegUniqueId, redisMessageHandler);
            }
            redisClient.expire(uniqueId, 86400, redisMessageHandler);

            break;

        case 'CHANNEL_CALLSTATE':
        {

            if(callMonitorOtherLeg)
            {
                redisClient.hset(uniqueId, 'Other-Leg-Unique-ID', callMonitorOtherLeg, redisMessageHandler);
            }
            else
            {
                if (otherLegUniqueId)
                {
                    redisClient.hset(uniqueId, 'Other-Leg-Unique-ID', otherLegUniqueId, redisMessageHandler);
                }

                if (evtObj['variable_fifo_bridge_uuid'])
                {
                    redisClient.hset(uniqueId, 'Other-Leg-Unique-ID', evtObj['variable_fifo_bridge_uuid'], redisMessageHandler);
                    redisClient.hset(uniqueId, 'Call-Type', 'FIFO', redisMessageHandler);
                }
            }

        }
            //redisClient.hset(uniqueId, 'data', event.serialize('json'), redisMessageHandler);
            redisClient.hset(uniqueId, 'Channel-Call-State', evtObj['Channel-Call-State'], redisMessageHandler);
            redisClient.expire(uniqueId, 86400, redisMessageHandler);

            break;

        case 'CHANNEL_CREATE':

            var channelState = evtObj['Channel-State'];
            var channelName = evtObj['Channel-Name'];

            var callerUniqueId = evtObj['Caller-Unique-ID'];
            var fifoBridgeUuid = evtObj['variable_fifo_bridge_uuid'];
            var channelPresId = evtObj['Channel-Presence-ID'];
            var channelCallState = evtObj['Channel-Call-State'];
            var sipGatewayName = evtObj["variable_sip_gateway_name"];
            var variableLoopbackApp = evtObj["variable_loopback_app"];
            var variableSipAuthRealm = evtObj["variable_sip_auth_realm"];

            //<editor-fold desc="HANDLING INCOMING TRANSFER CALL NOTIFICATION WITH SYSTEM USERNAME NOTIFICATIONS">

            if(direction === 'outbound' && companyId && tenantId && opCat === 'ATT_XFER_USER')
            {
                var caller = evtObj['variable_dvp_trans_caller'];
                var digits = evtObj['variable_dvp_trans_party'];
                var origCaller = evtObj['variable_dvp_trans_orig_caller'];
                var transCallUuid = evtObj['Channel-Call-UUID'];

                if(evtObj['variable_ards_client_uuid'])
                {
                    transCallUuid = evtObj['variable_ards_client_uuid'];
                }

                redisClient.get('SIPUSER_RESOURCE_MAP:' + tenantId + ':' + companyId + ':' + digits, function(err, objString)
                {
                    var obj = JSON.parse(objString);

                    if(obj && obj.Context)
                    {
                        redisClient.get('SIPUSER_RESOURCE_MAP:' + tenantId + ':' + companyId + ':' + caller, function(err, objString)
                        {
                            var tmpObj = JSON.parse(objString);

                            if(tmpObj && tmpObj.Issuer)
                            {
                                caller = tmpObj.Issuer;
                            }

                            var tempSkill = 'INBOUND';

                            if(transCallSkill)
                            {
                                tempSkill = transCallSkill;
                            }

                            var nsObj = {
                                Ref: uniqueId,
                                To: obj.Issuer,
                                Timeout: 1000,
                                Direction: 'STATELESS',
                                From: 'CALLSERVER',
                                Callback: '',
                                Message: 'agent_found|' + transCallUuid + '|INBOUND|' + origCaller + '|' + obj.Issuer + '|' + obj.Issuer + '|' + tempSkill + '|inbound|call|' + caller + '|' + uniqueId + '|TRANSFER'
                            };

                            extApiAccess.SendNotificationInitiate(reqId, 'agent_found', uniqueId, nsObj, obj.CompanyId, obj.TenantId);

                            logger.debug('[DVP-EventMonitor.handler] - [%s] - SEND NOTIFICATION - AGENT FOUND - Message : ', reqId, nsObj.Message);
                        });




                    }

                });


            }

            //</editor-fold>

            if(actionCat === 'LISTEN')
            {
                if(opCat === 'PRIVATE_USER')
                {
                    //<editor-fold desc="Listen call">



                    redisClient.get('SIPUSER_RESOURCE_MAP:' + tenantId + ':' + companyId + ':' + callerDestNum, function(err, objString)
                    {
                        var objTmp = JSON.parse(objString);
                        var tempSkill=null;
                        if(transCallSkill)
                        {
                            tempSkill = transCallSkill;
                        }

                        if (objTmp && objTmp.Context)
                        {
                            //<editor-fold desc="SEND NOTIFICATION TO CALLING PARTY - AGENT_AGENT CALL">
                            extApiAccess.CreateEngagement(reqId, uniqueId, 'call', 'Test', callerOrigIdName, callerDestNum, objTmp.CompanyId, objTmp.TenantId);

                            var nsObj = {
                                Ref: uniqueId,
                                To: objTmp.Issuer,
                                Timeout: 1000,
                                Direction: 'STATELESS',
                                From: 'CALLSERVER',
                                Callback: '',
                                Message: 'agent_found|' + evtObj['variable_origination_caller_id_number'] + '|OUTBOUND|' + objTmp.Issuer + '|' + evtObj['Caller-ANI'] + '|' + objTmp.Issuer + '|'+listenCallSkill+'|outbound|call|undefined|' + uniqueId
                            };

                            extApiAccess.SendNotificationInitiate(reqId, 'agent_found', uniqueId, nsObj, objTmp.CompanyId, objTmp.TenantId);

                            logger.debug('[DVP-EventMonitor.handler] - [%s] - SEND NOTIFICATION - AGENT FOUND - Message : ', reqId, nsObj.Message);



                        }
                    });

                    //</editor-fold>


                }
            }


            if(direction === 'outbound' && dvpCallDirection === 'outbound' && companyId && tenantId)
            {
                if(actionCat === 'DIALER' && callLegType === 'AGENT')
                {
                    redisClient.get('SIPUSER_RESOURCE_MAP:' + tenantId + ':' + companyId + ':' + evtObj['Caller-Destination-Number'], function(err, objString)
                    {
                        var obj = JSON.parse(objString);

                        if(obj && obj.Context)
                        {
                            logger.debug('[DVP-EventMonitor.handler] - [%s] - OUTBOUND CHANNEL - SENDING', reqId);

                            //<editor-fold desc="HANDLING AGENT DIALED CALLS">

                            extApiAccess.CreateEngagement(reqId, uniqueId, 'call', 'outbound', evtObj['Caller-Destination-Number'], evtObj['Caller-Caller-ID-Number'], companyId, tenantId);

                            var nsObj = {
                                Ref: uniqueId,
                                To: obj.Issuer,
                                Timeout: 1000,
                                Direction: 'STATELESS',
                                From: 'CALLSERVER',
                                Callback: ''
                            };

                            nsObj.Message = 'agent_found|' + uniqueId + '|OUTBOUND|' + evtObj['Caller-Caller-ID-Number'] + '|' + evtObj['Caller-Caller-ID-Number'] + '|' + obj.Issuer + '|' + evtObj['variable_ards_skill_display'] + '|outbound|call|undefined' + otherLegUniqueId + '|DIALER';

                            extApiAccess.SendNotificationInitiate(reqId, 'agent_found', uniqueId, nsObj, obj.CompanyId, obj.TenantId);

                            logger.debug('[DVP-EventMonitor.handler] - [%s] - SEND NOTIFICATION - AGENT FOUND - Message : ', reqId, nsObj.Message);

                            //</editor-fold>

                        }
                        else
                        {
                            logger.debug('[DVP-EventMonitor.handler] - [%s] - OUTBOUND CHANNEL - CONTEXT NOT FOUND', reqId);
                        }

                    });
                }
                else
                {
                    redisClient.get('SIPUSER_RESOURCE_MAP:' + tenantId + ':' + companyId + ':' + callerOrigIdName, function(err, objString)
                    {
                        var obj = JSON.parse(objString);

                        if(obj && obj.Context)
                        {
                            logger.debug('[DVP-EventMonitor.handler] - [%s] - OUTBOUND CHANNEL - SENDING', reqId);

                            //<editor-fold desc="HANDLING AGENT DIALED CALLS">

                            if(opCat === 'PRIVATE_USER')
                            {
                                //<editor-fold desc="AGENT TO AGNET CALL SPECIFIC NOTIFICATION HANDLING WITH SYSTEM USERNAME">

                                extApiAccess.CreateEngagement(reqId, otherLegUniqueId, 'call', 'outbound', callerOrigIdName, callerDestNum, obj.CompanyId, obj.TenantId);

                                redisClient.get('SIPUSER_RESOURCE_MAP:' + tenantId + ':' + companyId + ':' + callerDestNum, function(err, objString)
                                {
                                    var objTmp = JSON.parse(objString);

                                    if (objTmp && objTmp.Context)
                                    {
                                        //<editor-fold desc="SEND NOTIFICATION TO CALLING PARTY - AGENT_AGENT CALL">
                                        var nsObj = {
                                            Ref: otherLegUniqueId,
                                            To: obj.Issuer,
                                            Timeout: 1000,
                                            Direction: 'STATELESS',
                                            From: 'CALLSERVER',
                                            Callback: '',
                                            Message: 'agent_found|' + otherLegUniqueId + '|OUTBOUND|' + objTmp.Issuer + '|' + objTmp.Issuer + '|' + obj.Issuer + '|OUTBOUND|outbound|call|undefined|' + uniqueId
                                        };

                                        extApiAccess.SendNotificationInitiate(reqId, 'agent_found', otherLegUniqueId, nsObj, obj.CompanyId, obj.TenantId);

                                        logger.debug('[DVP-EventMonitor.handler] - [%s] - SEND NOTIFICATION - AGENT FOUND - Message : ', reqId, nsObj.Message);

                                        //</editor-fold>

                                        //<editor-fold desc="SEND NOTIFICATION TO CALL RECEIVING PARTY - AGENT_AGENT CALL">

                                        var nsObjRec = {
                                            Ref: otherLegUniqueId,
                                            To: objTmp.Issuer,
                                            Timeout: 1000,
                                            Direction: 'STATELESS',
                                            From: 'CALLSERVER',
                                            Callback: '',
                                            Message: 'agent_found|' + otherLegUniqueId + '|OUTBOUND|' + objTmp.Issuer + '|' + objTmp.Issuer + '|' + obj.Issuer + '|OUTBOUND|outbound|call|undefined|' + uniqueId + '|AGENT_AGENT'
                                        };

                                        extApiAccess.SendNotificationInitiate(reqId, 'agent_found', otherLegUniqueId, nsObjRec, objTmp.CompanyId, objTmp.TenantId);

                                        logger.debug('[DVP-EventMonitor.handler] - [%s] - SEND NOTIFICATION - AGENT FOUND - Message : ', reqId, nsObjRec.Message);

                                        //</editor-fold>

                                    }
                                });

                                //</editor-fold>


                            }
                            else if(opCat === 'GATEWAY')
                            {
                                //<editor-fold desc="AGENT TO GATEWAY CALL SPECIFIC NOTIFICATION HANDLING WITH SYSTEM USERNAME">

                                extApiAccess.CreateEngagement(reqId, otherLegUniqueId, 'call', 'outbound', callerOrigIdName, callerDestNum, obj.CompanyId, obj.TenantId);

                                var nsObj = {
                                    Ref: otherLegUniqueId,
                                    To: obj.Issuer,
                                    Timeout: 1000,
                                    Direction: 'STATELESS',
                                    From: 'CALLSERVER',
                                    Callback: '',
                                    Message: 'agent_found|' + otherLegUniqueId + '|OUTBOUND|' + callerDestNum + '|' + callerDestNum + '|' + obj.Issuer + '|OUTBOUND|outbound|call|undefined|' + uniqueId
                                };

                                extApiAccess.SendNotificationInitiate(reqId, 'agent_found', otherLegUniqueId, nsObj, obj.CompanyId, obj.TenantId);

                                logger.debug('[DVP-EventMonitor.handler] - [%s] - SEND NOTIFICATION - AGENT FOUND - Message : ', reqId, nsObj.Message);

                                //</editor-fold>

                            }

                            if(opCat === 'GATEWAY' || opCat === 'PRIVATE_USER')
                            {
                                dashboardEvtHandler.PublishDashboardMessage(obj.TenantId, obj.CompanyId, bUnit, "CALLSERVER", "CALL", "DIALED", obj.ResourceId, obj.ResourceId, 'outbound', eventTime);
                                ardsHandler.SendResourceStatus(reqId, otherLegUniqueId, obj.CompanyId, obj.TenantId, 'CALLSERVER', 'CALL', obj.ResourceId, 'Reserved', '', '', 'outbound', bUnit);
                            }

                            //</editor-fold>

                        }
                        else
                        {
                            logger.debug('[DVP-EventMonitor.handler] - [%s] - OUTBOUND CHANNEL - CONTEXT NOT FOUND', reqId);
                        }

                    });
                }

            }

            //Setting Resource Status Reserved for Receiving Agent

            if(direction === 'outbound' && companyId && tenantId && ((opCat === 'PRIVATE_USER' && dvpCallDirection === 'outbound') || opCat === 'ATT_XFER_USER'))
            {
                redisClient.get('SIPUSER_RESOURCE_MAP:' + tenantId + ':' + companyId + ':' + evtObj['variable_dialed_user'], function(err, objString)
                {
                    var obj = JSON.parse(objString);

                    if(obj && obj.Context)
                    {
                        logger.debug('[DVP-EventMonitor.handler] - [%s] - OUTBOUND CHANNEL - SENDING', reqId);

                        var tempUuid = otherLegUniqueId;

                        //In case this is a transfer call related to a ards inbound call
                        if(evtObj['variable_ards_client_uuid'])
                        {
                            tempUuid = evtObj['variable_ards_client_uuid'];
                        }
                        //In case this is a normal outbound call
                        else
                        {
                            tempUuid = uniqueId;
                        }

                        //for agent dialed outbound calls
                        ardsHandler.SendResourceStatus(reqId, tempUuid, obj.CompanyId, obj.TenantId, 'CALLSERVER', 'CALL', obj.ResourceId, 'Reserved', '', '', 'outbound', bUnit);

                    }
                    else
                    {
                        logger.debug('[DVP-EventMonitor.handler] - [%s] - OUTBOUND CHANNEL - CONTEXT NOT FOUND', reqId);
                    }

                })
            }

            //Handle From User Resource Status Change
            /*if(sipFromUri && direction === 'inbound')
             {
             redisClient.get('SIPUSER_RESOURCE_MAP:'+ sipFromUri, function(err, obj)
             {
             if(obj && obj.Context && callerContext === obj.Context)
             {
             ardsHandler.SendResourceStatus(reqId, uniqueId, obj.CompanyId, obj.TenantId, '', '', obj.ResourceId, 'Reserved', '', '');

             }
             })
             }*/


            if(companyId && tenantId)
            {
                redisClient.incr(chanCountCompany, redisMessageHandler);
            }

            redisClient.incr(chanCountInstance, redisMessageHandler);

            evtData.EventCategory = "CHANNEL_CREATE";

            var jsonStr = '';
            if(dvpCustPubId)
            {
                if(!ardsClientUuid && evtObj['variable_ards_client_uuid'])
                {
                    evtData.SessionId = evtObj['variable_ards_client_uuid'];
                }
                jsonStr = JSON.stringify(evtData);

                logger.debug('[DVP-EventMonitor.handler] - [%s] - REDIS PUBLISH CUSTOM: %s', reqId, jsonStr);

                redisClient.publish(dvpCustPubId, jsonStr);
            }
            else
            {
                dvpEventHandler.PublishDVPEventsMessage(evtData);
                /*jsonStr = JSON.stringify(evtData);
                redisClient.publish('SYS:MONITORING:DVPEVENTS', jsonStr);*/
            }

            var channelSetName = "CHANNELS:" + tenantId + ":" + companyId;

            if(companyId && tenantId)
            {
                redisClient.sadd(channelSetName, uniqueId, redisMessageHandler);

                dashboardEvtHandler.PublishDashboardMessage(tenantId, companyId, bUnit, "CALLSERVER", "CHANNEL", "CREATE", uniqueId, '', '', eventTime);

                /*var pubMessage = util.format("EVENT:%s:%s:%s:%s:%s:%s:%s:%s:YYYY", tenantId, companyId, "CALLSERVER", "CHANNEL", "CREATE", "", "", uniqueId);

                redisClient.publish('events', pubMessage);*/

                logger.debug('=========================== ADD TO SET : [%s] - [%s] ==========================', channelSetName, uniqueId);
            }
            else
            {
                logger.debug('=========================== ADD TO SET - COMPANY NOT SET : [%s] ==========================', channelSetName, uniqueId);
            }

            if (!variableLoopbackApp)
            {
                redisClient.hset(uniqueId, 'Unique-ID', uniqueId, function(err, redisRes)
                {
                    redisClient.expire(uniqueId, 86400, redisMessageHandler);
                });
                redisClient.hset(uniqueId, 'Channel-State', channelState, redisMessageHandler);
                redisClient.hset(uniqueId, 'FreeSWITCH-Switchname', switchName, redisMessageHandler);
                redisClient.hset(uniqueId, 'FreeSWITCH-Hostname', freeswitchHostname, redisMessageHandler);
                redisClient.hset(uniqueId, 'Channel-Name', channelName, redisMessageHandler);
                redisClient.hset(uniqueId, 'Call-Direction', direction, redisMessageHandler);
                redisClient.hset(uniqueId, 'Caller-Destination-Number', callerDestNum, redisMessageHandler);
                redisClient.hset(uniqueId, 'Caller-Unique-ID', callerUniqueId, redisMessageHandler);
                redisClient.hset(uniqueId, 'variable_sip_auth_realm', variableSipAuthRealm, redisMessageHandler);
                redisClient.hset(uniqueId, 'variable_dvp_app_id', dvpAppId, redisMessageHandler);
                redisClient.hset(uniqueId, 'Caller-Caller-ID-Number', callerIdNum, redisMessageHandler);
                redisClient.hset(uniqueId, 'Channel-Create-Time', eventTime, redisMessageHandler);

                if(callMonitorOtherLeg)
                {
                    redisClient.hset(uniqueId, 'Other-Leg-Unique-ID', callMonitorOtherLeg, redisMessageHandler);
                }
                else
                {
                    if (otherLegUniqueId)
                    {
                        redisClient.hset(uniqueId, 'Other-Leg-Unique-ID', otherLegUniqueId, redisMessageHandler);
                    }

                    if (fifoBridgeUuid)
                    {
                        redisClient.hset(uniqueId, 'Other-Leg-Unique-ID', fifoBridgeUuid, redisMessageHandler);
                        otherLegUniqueId = fifoBridgeUuid;
                        redisClient.hset(uniqueId, 'Call-Type', 'FIFO', redisMessageHandler);
                    }
                }



            }

            break;
        case 'CHANNEL_STATE':
            if (evtObj['Channel-State'] != 'CS_DESTROY')
            {
                //logger.debug('[DVP-EventMonitor.handler] - [%s] - REDIS GET');
                redisClient.hset(uniqueId, 'Channel-State', evtObj['Channel-State'], redisMessageHandler);
                redisClient.expire(uniqueId, 86400, redisMessageHandler);
            }
            else
            {
                redisClient.del(uniqueId, redisMessageHandler);
            }
            break;

        case 'CHANNEL_HOLD':

            var channelUuid = evtObj['Channel-Call-UUID'];

            redisClient.hgetall(channelUuid, function(err, channelHash)
            {

                if(channelHash)
                {

                    var hashResId = channelHash['Agent-Resource-Id'];
                    var hashArdsClientUuid = channelHash['ARDS-Client-Uuid'];
                    var hashCallDirection = channelHash['DVP-Call-Direction'];
                    var hashCompany = channelHash['DVP-CompanyId'];
                    var hashTenant = channelHash['DVP-TenantId'];
                    var hashBUnit = channelHash['DVP-Business-Unit'];

                    if(hashArdsClientUuid && hashResId)
                    {
                        if(hashCompany && hashTenant && hashResId && hashArdsClientUuid && hashCallDirection)
                        {
                            dashboardEvtHandler.PublishDashboardMessage(hashTenant, hashCompany, hashBUnit, "CALLSERVER", "CALL", "HOLD", hashArdsClientUuid, hashResId, hashCallDirection, eventTime);

                            /*var pubMessage = util.format("EVENT:%s:%s:%s:%s:%s:%s:%s:%s:YYYY", hashTenant, hashCompany, "CALLSERVER", "CALL", "HOLD", hashResId, hashCallDirection, hashArdsClientUuid);

                            redisClient.publish('events', pubMessage);*/
                        }
                    }
                    else
                    {
                        var callerIdNm = channelHash['Caller-Caller-ID-Number'];

                        redisClient.get('SIPUSER_RESOURCE_MAP:' + hashTenant + ':' + hashCompany + ':' + callerIdNm, function(err, objString)
                        {
                            var obj = JSON.parse(objString);

                            if(obj)
                            {
                                hashResId = obj.ResourceId;
                                hashArdsClientUuid = channelUuid;

                                if(hashCompany && hashTenant && hashResId && hashArdsClientUuid && hashCallDirection)
                                {
                                    dashboardEvtHandler.PublishDashboardMessage(hashTenant, hashCompany, hashBUnit, "CALLSERVER", "CALL", "HOLD", hashArdsClientUuid, hashResId, hashCallDirection, eventTime);

                                    /*var pubMessage = util.format("EVENT:%s:%s:%s:%s:%s:%s:%s:%s:YYYY", hashTenant, hashCompany, "CALLSERVER", "CALL", "HOLD", hashResId, hashCallDirection, hashArdsClientUuid);

                                    redisClient.publish('events', pubMessage);*/
                                }
                            }
                        });
                    }




                }

            });
            break;
        case 'CHANNEL_UNHOLD':

            var channelUuid = evtObj['Channel-Call-UUID'];

            redisClient.hgetall(channelUuid, function(err, channelHash)
            {

                if(channelHash)
                {
                    var hashResId = channelHash['Agent-Resource-Id'];
                    var hashArdsClientUuid = channelHash['ARDS-Client-Uuid'];
                    var hashCallDirection = channelHash['DVP-Call-Direction'];
                    var hashCompany = channelHash['DVP-CompanyId'];
                    var hashTenant = channelHash['DVP-TenantId'];
                    var hashBUnit = channelHash['DVP-Business-Unit'];

                    if(hashArdsClientUuid && hashResId)
                    {
                        if(hashCompany && hashTenant && hashResId && hashArdsClientUuid && hashCallDirection)
                        {
                            dashboardEvtHandler.PublishDashboardMessage(hashTenant, hashCompany, hashBUnit, "CALLSERVER", "CALL", "UNHOLD", hashArdsClientUuid, hashResId, hashCallDirection, eventTime);

                            /*var pubMessage = util.format("EVENT:%s:%s:%s:%s:%s:%s:%s:%s:YYYY", hashTenant, hashCompany, "CALLSERVER", "CALL", "UNHOLD", hashResId, hashCallDirection, hashArdsClientUuid);

                            redisClient.publish('events', pubMessage);*/
                        }
                    }
                    else
                    {
                        var callerIdNm = channelHash['Caller-Caller-ID-Number'];

                        redisClient.get('SIPUSER_RESOURCE_MAP:' + hashTenant + ':' + hashCompany + ':' + callerIdNm, function(err, objString)
                        {
                            var obj = JSON.parse(objString);

                            if(obj)
                            {
                                hashResId = obj.ResourceId;
                                hashArdsClientUuid = channelUuid;

                                if(hashCompany && hashTenant && hashResId && hashArdsClientUuid && hashCallDirection)
                                {
                                    dashboardEvtHandler.PublishDashboardMessage(hashTenant, hashCompany, hashBUnit, "CALLSERVER", "CALL", "UNHOLD", hashArdsClientUuid, hashResId, hashCallDirection, eventTime);

                                    /*var pubMessage = util.format("EVENT:%s:%s:%s:%s:%s:%s:%s:%s:YYYY", hashTenant, hashCompany, "CALLSERVER", "CALL", "UNHOLD", hashResId, hashCallDirection, hashArdsClientUuid);

                                    redisClient.publish('events', pubMessage);*/
                                }
                            }
                        });
                    }




                }

            });

            break;
        case 'CHANNEL_ANSWER':

            if(!ardsClientUuid)
            {
                ardsClientUuid = evtObj['variable_ards_client_uuid'];
            }
            var ardsCompany = evtObj['variable_companyid'];
            var ardsTenant = evtObj['variable_tenantid'];
            var ardsServerType = evtObj['variable_ards_servertype'];
            var ardsReqType = evtObj['variable_ards_requesttype'];
            var ardsResourceId = evtObj['variable_ards_resource_id'];


            logger.debug('[DVP-EventMonitor.handler] - [%s] - CHANNEL ANSWER ARDS DATA - EVENT_TYPE : ' + evtType + ', SESSION_ID : ' + uniqueId + 'SWITCH NAME : ' + switchName + 'ards_client_uuid : %s, companyid : %s, tenantid : %s, ards_resource_id : %s, ards_servertype : %s, ards_requesttype : %s', reqId, ardsClientUuid, ardsCompany, ardsTenant, ardsResourceId, ardsServerType, ardsReqType);

            if (actionCat === 'DIALER' && callLegType === 'AGENT')
            {
                redisClient.get('SIPUSER_RESOURCE_MAP:' + tenantId + ':' + companyId + ':' + evtObj['Caller-Destination-Number'], function(err, objString)
                {
                    var obj = JSON.parse(objString);

                    if(obj && obj.Context)
                    {
                        var nsObj = {
                            Ref: uniqueId,
                            To: obj.Issuer,
                            Timeout: 1000,
                            Direction: 'STATELESS',
                            From: 'CALLSERVER',
                            Callback: ''
                        };

                        nsObj.Message = 'agent_connected|' + uniqueId + '|OUTBOUND|' + evtObj['Caller-Caller-ID-Number'] + '|' + evtObj['Caller-Caller-ID-Number'] + '|' + obj.Issuer + '|' + evtObj['variable_ards_skill_display'] + '|outbound|call|undefined|' + otherLegUniqueId;

                        extApiAccess.SendNotificationInitiate(reqId, 'agent_connected', uniqueId, nsObj, obj.CompanyId, obj.TenantId);

                        logger.debug('[DVP-EventMonitor.handler] - [%s] - SEND NOTIFICATION - AGENT CONNECTED - Message : ', reqId, nsObj.Message);


                    }
                    else
                    {
                        logger.debug('[DVP-EventMonitor.handler] - [%s] - OUTBOUND CHANNEL - CONTEXT NOT FOUND', reqId);
                    }

                })

            }

            if(actionCat === 'LISTEN')
            {
                if(opCat === 'PRIVATE_USER')
                {
                    //<editor-fold desc="Listen call">



                    redisClient.get('SIPUSER_RESOURCE_MAP:' + tenantId + ':' + companyId + ':' + callerDestNum, function(err, objString)
                    {
                        var objTmp = JSON.parse(objString);
                        var tempSkill=null;
                        if(transCallSkill)
                        {
                            tempSkill = transCallSkill;
                        }

                        if (objTmp && objTmp.Context)
                        {
                            //<editor-fold desc="SEND NOTIFICATION TO CALLING PARTY - AGENT_AGENT CALL">
                            extApiAccess.CreateEngagement(reqId, uniqueId, 'call', 'Test', callerOrigIdName, callerDestNum, objTmp.CompanyId, objTmp.TenantId);

                            var nsObj = {
                                Ref: uniqueId,
                                To: objTmp.Issuer,
                                Timeout: 1000,
                                Direction: 'STATELESS',
                                From: 'CALLSERVER',
                                Callback: '',
                                Message: 'listen_connected|' + evtObj['variable_origination_caller_id_number'] + '|OUTBOUND|' + objTmp.Issuer + '|' + objTmp.Issuer + '|' + objTmp.Issuer + '|'+listenCallSkill+'|outbound|call|undefined|' + uniqueId
                            };

                            extApiAccess.SendNotificationInitiate(reqId, 'listen_connected', uniqueId, nsObj, objTmp.CompanyId, objTmp.TenantId);

                            logger.debug('[DVP-EventMonitor.handler] - [%s] - SEND NOTIFICATION - AGENT FOUND - Message : ', reqId, nsObj.Message);



                        }
                    });

                    //</editor-fold>


                }
            }


            if(opCat === 'ATT_XFER_USER')
            {
                if(!ardsClientUuid)
                {
                    ardsClientUuid = uniqueId;
                }

                if(ardsCompany && ardsTenant && ardsClientUuid)
                {
                    redisClient.get('SIPUSER_RESOURCE_MAP:' + ardsTenant + ':' + ardsCompany + ':' + calleeNumber, function(err, objString)
                    {

                        var obj = JSON.parse(objString);

                        if(obj && obj.Context)
                        {
                            ardsHandler.SendResourceStatus(reqId, ardsClientUuid, ardsCompany, ardsTenant, 'CALLSERVER', 'CALL', obj.ResourceId, 'Connected', '', '', 'outbound', bUnit);
                        }

                    })
                }

            }
            else if(opCat === 'FAX_INBOUND')
            {
                extApiAccess.CreateEngagement(reqId, uniqueId, 'fax', 'inbound', callerIdNum, callerDestNum, companyId, tenantId);
            }
            else
            {
                //SET RESOURCE STATUS FOR CALL RECEIVING PARTY ARDS SET CALLS
                if(ardsClientUuid)
                {
                    //IF ARDSCLIIENTUUID IS SET NO NEED TO SEND NOTIFICATIONS
                    redisClient.hset(ardsClientUuid, 'ARDS-Client-Uuid', ardsClientUuid, redisMessageHandler);
                    ardsHandler.SendResourceStatus(reqId, ardsClientUuid, ardsCompany, ardsTenant, ardsServerType, ardsReqType, ardsResourceId, 'Connected', '', '', 'inbound', bUnit);


                }
                //Direction is outbound - This is for processing LEG B of an outbound call
                else if(direction === 'outbound' && companyId && tenantId && dvpCallDirection === 'outbound')
                {

                    /*if(opCat === 'PRIVATE_USER')
                    {
                        //SET RESOURCE STATUS FOR CALL RECEIVING PARTY NORMAL CALLS
                        redisClient.get('SIPUSER_RESOURCE_MAP:' + tenantId + ':' + companyId + ':' + calleeNumber, function(err, objString)
                        {
                            var obj = JSON.parse(objString);

                            if(obj && obj.Context)
                            {
                                ardsHandler.SendResourceStatus(reqId, uniqueId, companyId, tenantId, 'CALLSERVER', 'CALL', obj.ResourceId, 'Connected', '', '', 'outbound');

                            }

                        });

                    }*/

                    //<editor-fold desc="SET NOTIFICATION STATUS AND UPDATE OUTBOUND ANSWERED COUNT DASHBOARD FOR CALLING PARTY NORMAL CALLS">
                    if(opCat === 'GATEWAY' || opCat === 'PRIVATE_USER')
                    {
                        redisClient.get('SIPUSER_RESOURCE_MAP:' + tenantId + ':' + companyId + ':' + callerOrigIdName, function(err, objString)
                        {
                            var obj = JSON.parse(objString);

                            if(obj && obj.Context)
                            {
                                //<editor-fold desc="UPDATE OUTBOUND ANSWER COUNT ON DASHBOARD FOR CALLER">

                                dashboardEvtHandler.PublishDashboardMessage(tenantId, companyId, bUnit, "CALLSERVER", "CALL", "ANSWER", obj.ResourceId, obj.ResourceId, 'outbound', eventTime);

                                /*var pubMessage = util.format("EVENT:%s:%s:%s:%s:%s:%s:%s:%s:YYYY", tenantId, companyId, "CALLSERVER", "CALL", "ANSWER", obj.ResourceId, 'outbound', obj.ResourceId);

                                redisClient.publish('events', pubMessage);*/

                                //</editor-fold>

                                //<editor-fold desc="SEND NOTIFICATION FOR CALLING PARTY">
                                var nsObj = {
                                    Ref: uniqueId,
                                    To: obj.Issuer,
                                    Timeout: 1000,
                                    Direction: 'STATELESS',
                                    From: 'CALLSERVER',
                                    Callback: ''
                                };

                                nsObj.Message = 'agent_connected|' + uniqueId + '|OUTBOUND|' + callerDestNum + '|' + callerDestNum + '|' + callerOrigIdName + '|OUTBOUND|outbound|call|undefined|' + otherLegUniqueId;

                                extApiAccess.SendNotificationInitiate(reqId, 'agent_connected', uniqueId, nsObj, obj.CompanyId, obj.TenantId);

                                logger.debug('[DVP-EventMonitor.handler] - [%s] - SEND NOTIFICATION - AGENT CONNECTED - Message : ', reqId, nsObj.Message);

                                //</editor-fold>

                            }

                        })
                    }

                    //</editor-fold>


                }

            }

            //<editor-fold desc="Handling Calling Party Resource Status Change">

            var tempUsr = evtObj['variable_user_id'];

            if(!tempUsr)
            {
                tempUsr = evtObj['variable_dialed_user'];
            }

            if(!ardsResourceId && tempUsr && companyId && tenantId && dvpCallDirection === 'outbound')
            {
                if(opCat === 'GATEWAY' || opCat === 'PRIVATE_USER')
                {
                    redisClient.get('SIPUSER_RESOURCE_MAP:' + tenantId + ':' + companyId + ':' + tempUsr, function(err, objString)
                    {
                        var obj = JSON.parse(objString);

                        if(obj && obj.Context)
                        {
                            console.log('======================ANSWER====================' + direction);
                            ardsHandler.SendResourceStatus(reqId, uniqueId, companyId, tenantId, 'CALLSERVER', 'CALL', obj.ResourceId, 'Connected', '', '', 'outbound', bUnit);

                        }

                    });
                }
            }

            //</editor-fold>


            evtData.EventCategory = "CHANNEL_ANSWER";

            var jsonStr = '';
            if(dvpCustPubId)
            {
                if(ardsClientUuid)
                {
                    evtData.SessionId = ardsClientUuid;
                }
                jsonStr = JSON.stringify(evtData);

                logger.debug('[DVP-EventMonitor.handler] - [%s] - REDIS PUBLISH CUSTOM: %s', reqId, jsonStr);

                redisClient.publish(dvpCustPubId, jsonStr);
            }
            else
            {
                dvpEventHandler.PublishDVPEventsMessage(evtData);
                /*jsonStr = JSON.stringify(evtData);
                redisClient.publish('SYS:MONITORING:DVPEVENTS', jsonStr);*/
            }

            break;

        case 'CHANNEL_UNBRIDGE':

            redisClient.decr(callCountInstance);
            redisClient.decr(callCountCompany);

            if(dvpCallDirection)
            {
                var callCountCompanyDir = 'DVP_CALL_COUNT_COMPANY_DIR:' + tenantId + ':' + companyId + ':' + dvpCallDirection;

                redisClient.decr(callCountCompanyDir, redisMessageHandler);

            }

            var unBridgeDashboardUid = uniqueId;

            if(evtObj['Bridge-B-Unique-ID'])
            {
                unBridgeDashboardUid = evtObj['Bridge-B-Unique-ID'];
            }

            dashboardEvtHandler.PublishDashboardMessage(tenantId, companyId, bUnit, "CALLSERVER", "CALL", "UNBRIDGE", unBridgeDashboardUid, '', dvpCallDirection, eventTime);

            /*var pubMessage = util.format("EVENT:%s:%s:%s:%s:%s:%s:%s:%s:YYYY", tenantId, companyId, "CALLSERVER", "CALL", "UNBRIDGE", "", dvpCallDirection, unBridgeDashboardUid);

            redisClient.publish('events', pubMessage);*/
            //logger.debug('[DVP-EventMonitor.handler] - [%s] - REDIS DECREMENT');
            break;

        case 'HEARTBEAT':

            var utcSec = parseInt(variableEvtTime)/1000000;
            var dat = new Date(0); // The 0 there is the key, which sets the date to the epoch
            dat.setUTCSeconds(utcSec);

            var hbData =
                {
                    FsHostName: evtObj['FreeSWITCH-Hostname'],
                    FSInstanceId: switchName,
                    FsIPv4: evtObj['FreeSWITCH-IPv4'],
                    UpTime: evtObj['Up-Time'],
                    FsVersion: evtObj['FreeSWITCH-Version'],
                    UpTimeMSec: evtObj['Uptime-msec'],
                    SessionCount: evtObj['Session-Count'],
                    MaxSessions: evtObj['Max-Sessions'],
                    SessionsPerSec: evtObj['Session-Per-Sec'],
                    SessionsPerSecMax: evtObj['Session-Per-Sec-Max'],
                    SessionsSinceStartUp: evtObj['Session-Since-Startup'],
                    IdleCpu: evtObj['Idle-CPU'],
                    EventTime: dat.toISOString()
                };

            if(switchName)
            {
                redisClient.set(switchName + '#DVP_CS_INSTANCE_INFO', JSON.stringify(hbData), redisMessageHandler);
            }

            break;
        case 'CHANNEL_HANGUP':

            var ardsClientUuid = evtObj['variable_ards_client_uuid'];
            var ardsCompany = evtObj['variable_companyid'];
            var ardsTenant = evtObj['variable_tenantid'];
            var ardsServerType = evtObj['variable_ards_servertype'];
            var ardsReqType = evtObj['variable_ards_requesttype'];
            var ardsResourceId = evtObj['variable_ards_resource_id'];

            //Handle Resource Status Change

            if(ardsClientUuid && ardsServerType && ardsReqType && ardsResourceId)
            {
                ardsHandler.SendResourceStatus(reqId, ardsClientUuid, ardsCompany, ardsTenant, ardsServerType, ardsReqType, ardsResourceId, 'Completed', '', '', 'inbound', bUnit);
            }
            else if(ardsCompany && ardsTenant && opCat && (evtObj['variable_user_id'] || evtObj['variable_dialed_user']) && actionCat != 'DIALER')
            {
                var tempUser = evtObj['variable_user_id'];
                if(!evtObj['variable_user_id'])
                {
                    tempUser = evtObj['variable_dialed_user'];
                }
                var tempDirection = 'outbound';
                var tempUuid = uniqueId;

                if(ardsClientUuid)
                {
                    tempUuid = ardsClientUuid;
                }

                if(dvpCallDirection === 'inbound')
                {
                    tempDirection = 'inbound';
                }
                redisClient.get('SIPUSER_RESOURCE_MAP:' + ardsTenant + ':' + ardsCompany + ':' + tempUser, function(err, objString)
                {

                    var obj = JSON.parse(objString);

                    if(obj && obj.Context)
                    {
                        ardsHandler.SendResourceStatus(reqId, tempUuid, ardsCompany, ardsTenant, 'CALLSERVER', 'CALL', obj.ResourceId, 'Completed', '', '', tempDirection, bUnit);
                    }

                })
            }

            if(evtObj['variable_dvp_trans_caller'] && evtObj['variable_dvp_trans_party'])
            {
                redisClient.get('SIPUSER_RESOURCE_MAP:' + ardsTenant + ':' + ardsCompany + ':' + evtObj['variable_dvp_trans_caller'], function(err, objString)
                {

                    var obj = JSON.parse(objString);

                    if(obj && obj.Context)
                    {
                        var nsObj = {
                            Ref: reqId,
                            To: obj.Issuer,
                            Timeout: 1000,
                            Direction: 'STATELESS',
                            From: 'CALLSERVER',
                            Callback: '',
                            Message: 'transfer_ended|' + reqId + '|OUTBOUND|' + evtObj['variable_dvp_trans_caller'] + '|' + evtObj['variable_dvp_trans_party'] + '|OUTBOUND|outbound|call|undefined|' + ardsClientUuid + '|' + evtObj['Hangup-Cause']
                        };

                        extApiAccess.SendNotificationInitiate(reqId, 'transfer_ended', reqId, nsObj, ardsCompany, ardsTenant);

                        logger.debug('[DVP-EventMonitor.handler] - [%s] - SEND NOTIFICATION - AGENT TRANSFER ENDED - Message : ', reqId, nsObj.Message);


                    }

                })
            }

            if(ardsClientUuid)
            {
                if (actionCat === 'DIALER')
                {
                    redisClient.get('SIPUSER_RESOURCE_MAP:' + tenantId + ':' + companyId + ':' + evtObj['Caller-Destination-Number'], function(err, objString)
                    {
                        var obj = JSON.parse(objString);
                        if(obj && obj.Context)
                        {
                            var nsObj = {
                                Ref: uniqueId,
                                To: obj.Issuer,
                                Timeout: 1000,
                                Direction: 'STATELESS',
                                From: 'CALLSERVER',
                                Callback: '',
                                Message: 'agent_disconnected|' + uniqueId + '|OUTBOUND|' + evtObj['Caller-Caller-ID-Number'] + '|' + evtObj['Caller-Caller-ID-Number'] + '|' + obj.Issuer + '|' + evtObj['variable_ards_skill_display'] + '|outbound|call|undefined|' + otherLegUniqueId
                            };

                            extApiAccess.SendNotificationInitiate(reqId, 'agent_disconnected', uniqueId, nsObj, companyId, tenantId);

                            logger.debug('[DVP-EventMonitor.handler] - [%s] - SEND NOTIFICATION - AGENT DISCONNECTED - Message : ', reqId, nsObj.Message);


                        }

                    })

                }
            }
            else if(evtObj['variable_DVP_CLICKTOCALL'] === 'C2C' && direction === 'outbound' && companyId && tenantId && opCat === 'GATEWAY' && dvpCallDirection === 'outbound')
            {
                callerOrigIdName = evtObj['Caller-Caller-ID-Number'];

                redisClient.get('SIPUSER_RESOURCE_MAP:' + tenantId + ':' + companyId + ':' + callerOrigIdName, function(err, objString)
                {
                    var obj = JSON.parse(objString);
                    if(obj && obj.Context)
                    {
                        if(dvpCallDirection === 'outbound' && opCat === 'GATEWAY')
                        {
                            var nsObj = {
                                Ref: uniqueId,
                                To: obj.Issuer,
                                Timeout: 1000,
                                Direction: 'STATELESS',
                                From: 'CALLSERVER',
                                Callback: '',
                                Message: 'agent_disconnected|' + uniqueId + '|OUTBOUND|' + callerDestNum + '|' + callerDestNum + '|' + callerOrigIdName + '|OUTBOUND|outbound|call|undefined|' + otherLegUniqueId
                            };

                            extApiAccess.SendNotificationInitiate(reqId, 'agent_disconnected', uniqueId, nsObj, companyId, tenantId);

                            logger.debug('[DVP-EventMonitor.handler] - [%s] - SEND NOTIFICATION - AGENT DISCONNECTED - Message : ', reqId, nsObj.Message);
                        }


                    }

                })
            }
            else if(direction === 'outbound' && companyId && tenantId && dvpCallDirection === 'outbound')
            {
                //SET RESOURCE STATUS FOR CALLING PARTY NORMAL CALLS
                if(opCat === 'GATEWAY' || opCat === 'PRIVATE_USER')
                {
                    redisClient.get('SIPUSER_RESOURCE_MAP:' + tenantId + ':' + companyId + ':' + callerOrigIdName, function(err, objString)
                    {
                        var obj = JSON.parse(objString);

                        var hangupCause = evtObj['Hangup-Cause'];
                        if(obj && obj.Context)
                        {
                            var nsObj = {
                                Ref: uniqueId,
                                To: obj.Issuer,
                                Timeout: 1000,
                                Direction: 'STATELESS',
                                From: 'CALLSERVER',
                                Callback: '',
                                Message: 'agent_disconnected|' + uniqueId + '|OUTBOUND|' + callerDestNum + '|' + callerDestNum + '|' + callerOrigIdName + '|OUTBOUND|outbound|call|' + hangupCause + '|' + otherLegUniqueId
                            };

                            extApiAccess.SendNotificationInitiate(reqId, 'agent_disconnected', uniqueId, nsObj, companyId, tenantId);

                            logger.debug('[DVP-EventMonitor.handler] - [%s] - SEND NOTIFICATION - AGENT DISCONNECTED - Message : ', reqId, nsObj.Message);


                        }

                    })
                }
            }

            var varCallerIdNum = evtObj['variable_origination_caller_id_number'];
            var varOrigLegUuid = evtObj['variable_originating_leg_uuid'];

            if(!varOrigLegUuid)
            {
                varOrigLegUuid = uniqueId;
            }

            if(actionCat === 'LISTEN')
            {
                if(opCat === 'PRIVATE_USER')
                {
                    //<editor-fold desc="Listen call">



                    redisClient.get('SIPUSER_RESOURCE_MAP:' + tenantId + ':' + companyId + ':' + callerDestNum, function(err, objString)
                    {
                        var objTmp = JSON.parse(objString);
                        var tempSkill=null;
                        if(transCallSkill)
                        {
                            tempSkill = transCallSkill;
                        }

                        if (objTmp && objTmp.Context)
                        {
                            //<editor-fold desc="SEND NOTIFICATION TO CALLING PARTY - AGENT_AGENT CALL">
                            extApiAccess.CreateEngagement(reqId, uniqueId, 'call', 'Test', callerOrigIdName, callerDestNum, objTmp.CompanyId, objTmp.TenantId);

                            var nsObj = {
                                Ref: uniqueId,
                                To: objTmp.Issuer,
                                Timeout: 1000,
                                Direction: 'STATELESS',
                                From: 'CALLSERVER',
                                Callback: '',
                                Message: 'listen_disconnected|' + evtObj['variable_origination_caller_id_number'] + '|OUTBOUND|' + objTmp.Issuer + '|' + objTmp.Issuer + '|' + objTmp.Issuer + '|'+listenCallSkill+'|outbound|call|undefined|' + uniqueId
                            };

                            extApiAccess.SendNotificationInitiate(reqId, 'listen_disconnected', uniqueId, nsObj, objTmp.CompanyId, objTmp.TenantId);

                            logger.debug('[DVP-EventMonitor.handler] - [%s] - SEND NOTIFICATION - AGENT FOUND - Message : ', reqId, nsObj.Message);



                        }
                    });

                    //</editor-fold>


                }
            }

            if(opCat === 'ATT_XFER_GATEWAY' && direction === 'outbound' && callerContext === 'PBXFeatures' && dvpCallDirection === 'outbound')
            {
                extApiAccess.BillEndCall(reqId, varOrigLegUuid, varCallerIdNum, callerDestNum, 'minute', companyId, tenantId);
            }

            if(opCat === 'GATEWAY' && direction === 'outbound' && dvpCallDirection === 'outbound' && otherLegUniqueId)
            {
                extApiAccess.BillEndCall(reqId, otherLegUniqueId, varCallerIdNum, callerDestNum, 'minute', companyId, tenantId);
            }

            logger.debug('[DVP-EventMonitor.handler] - [%s] - CHANNEL ANSWER ARDS DATA - EVENT_TYPE : ' + evtType + ', SESSION_ID : ' + uniqueId + 'SWITCH NAME : ' + switchName + 'ards_client_uuid : %s, companyid : %s, tenantid : %s, ards_resource_id : %s, ards_servertype : %s, ards_requesttype : %s', reqId, ardsClientUuid, ardsCompany, ardsTenant, ardsResourceId, ardsServerType, ardsReqType);

            /*if((opCat === 'ATT_XFER_USER' || opCat === 'ATT_XFER_GATEWAY') && ardsCompany && ardsTenant)
            {
                if(!ardsClientUuid && evtObj['variable_user_id'])
                {
                    redisClient.get('SIPUSER_RESOURCE_MAP:' + ardsTenant + ':' + ardsCompany + ':' + evtObj['variable_user_id'], function(err, objString)
                    {

                        var obj = JSON.parse(objString);

                        if(obj && obj.Context)
                        {
                            ardsHandler.SendResourceStatus(reqId, uniqueId, ardsCompany, ardsTenant, 'CALLSERVER', 'CALL', obj.ResourceId, 'Completed', '', '', 'outbound');
                        }

                    })
                }
                else
                {
                    redisClient.get('SIPUSER_RESOURCE_MAP:' + ardsTenant + ':' + ardsCompany + ':' + evtObj['variable_sip_to_user'], function(err, objString)
                    {

                        var obj = JSON.parse(objString);

                        if(obj && obj.Context)
                        {
                            ardsHandler.SendResourceStatus(reqId, ardsClientUuid, ardsCompany, ardsTenant, 'CALLSERVER', 'CALL', obj.ResourceId, 'Completed', '', '', 'outbound');
                        }

                    })
                }



            }*/
            /*else
            {



            }*/

            break;

        case 'CHANNEL_DESTROY':

            //Adding call discon record to redis set for cdr summary

            redisClient.del(uniqueId + '_data', redisMessageHandler);
            redisClient.del(uniqueId + '_dev', redisMessageHandler);
            redisClient.del(uniqueId + '_command', redisMessageHandler);


            var channelSetName = "CHANNELS:" + tenantId + ":" + companyId;

            if(companyId && tenantId)
            {
                redisClient.del('CHANNELMAP:' + uniqueId, redisMessageHandler);

                dashboardEvtHandler.PublishDashboardMessage(tenantId, companyId, bUnit, "CALLSERVER", "CHANNEL", "DESTROY", uniqueId, '', '', eventTime);

                /*var pubMessage = util.format("EVENT:%s:%s:%s:%s:%s:%s:%s:%s:YYYY", tenantId, companyId, "CALLSERVER", "CHANNEL", "DESTROY", "", "", uniqueId);

                redisClient.publish('events', pubMessage);*/

                redisClient.sismember(channelSetName, uniqueId, function(err, setContains)
                {
                    if(setContains)
                    {
                        redisClient.decr(chanCountCompany, redisMessageHandler);
                        redisClient.srem(channelSetName, uniqueId, redisMessageHandler);
                    }

                });



                logger.debug('=========================== REMOVE FROM SET : [%s] - [%s] ==========================', channelSetName, uniqueId);
            }
            else
            {
                logger.debug('=========================== REMOVE FROM SET - COMPANY NOT SET : [%s] ==========================', channelSetName, uniqueId);

                redisClient.get('CHANNELMAP:' + uniqueId, function(err, mapObj)
                {
                    if(mapObj)
                    {
                        redisClient.srem(mapObj, uniqueId, redisMessageHandler);

                        redisClient.del('CHANNELMAP:' + uniqueId, redisMessageHandler);

                        logger.debug('=========================== REMOVE FROM SET WITH FAILSAFE: [%s] - [%s] ==========================', mapObj, uniqueId);
                    }

                });
            }

            //Send Resource Status on Outbound Call


            /*if(ardsClientUuid)
             {
             ardsHandler.SendResourceStatus(reqId, ardsClientUuid, ardsCompany, ardsTenant, ardsServerType, ardsReqType, ardsResourceId, 'Completed', '', '', 'inbound');
             }*/



            redisClient.decr(chanCountInstance);

            evtData.EventCategory = "CHANNEL_DESTROY";
            evtData.DisconnectReason = evtObj['Hangup-Cause'];

            var jsonStr = '';
            if(dvpCustPubId)
            {
                if(!ardsClientUuid && evtObj['variable_ards_client_uuid'])
                {
                    evtData.SessionId = evtObj['variable_ards_client_uuid'];
                }
                jsonStr = JSON.stringify(evtData);

                logger.debug('[DVP-EventMonitor.handler] - [%s] - REDIS PUBLISH CUSTOM: %s', reqId, jsonStr);

                redisClient.publish(dvpCustPubId, jsonStr);
            }
            else
            {
                dvpEventHandler.PublishDVPEventsMessage(evtData);
                /*jsonStr = JSON.stringify(evtData);
                redisClient.publish('SYS:MONITORING:DVPEVENTS', jsonStr);*/
            }

            var channelSetNameApp = 'CHANNELS_APP:' + dvpAppId;


            redisClient.srem(channelSetNameApp, uniqueId, redisMessageHandler);
            redisClient.del(uniqueId, redisMessageHandler);

            break;

        case 'PRESENCE_IN':
            var userUri = evtObj['from'];
            var userStatus = evtObj['status'];
            var uriSplit = userUri.split('@');

            if(uriSplit && uriSplit.length == 2)
            {
                if(userStatus === 'Busy' || userStatus === 'Available')
                {
                    var presObj = {
                        SipUsername: uriSplit[0],
                        Domain: uriSplit[1],
                        Status: userStatus
                    };
                    redisClient.set('SIPPRESENCE:' + uriSplit[1] + ':' + uriSplit[0], JSON.stringify(presObj), redisMessageHandler);
                    dbOp.UpdatePresenceDB(uriSplit[0], userStatus);
                }
            }
            break;

        case 'TRANSFER_DISCONNECT':

            /*var caller = evtObj['caller'];
            var transCompanyId = evtObj['companyId'];
            var transTenantId = evtObj['tenantId'];
            var digits = evtObj['digits'];
            var transReason = evtObj['reason'];

            redisClient.get('SIPUSER_RESOURCE_MAP:' + transTenantId + ':' + transCompanyId + ':' + caller, function(err, objString)
            {
                var obj = JSON.parse(objString);

                if(obj && obj.Context)
                {
                    var nsObj = {
                        Ref: reqId,
                        To: obj.Issuer,
                        Timeout: 1000,
                        Direction: 'STATELESS',
                        From: 'CALLSERVER',
                        Callback: '',
                        Message: 'transfer_ended|' + reqId + '|OUTBOUND|' + caller + '|' + digits + '|OUTBOUND|outbound|call|undefined|' + reqId + '|' + transReason
                    };

                    extApiAccess.SendNotificationInitiate(reqId, 'transfer_ended', reqId, nsObj, transCompanyId, transTenantId);

                    logger.debug('[DVP-EventMonitor.handler] - [%s] - SEND NOTIFICATION - AGENT TRANSFER FAILED - Message : ', reqId, nsObj.Message);


                }

            });*/

            break;

        case 'TRANSFER_TRYING':

            var caller = evtObj['caller'];
            var transCompanyId = evtObj['companyId'];
            var transTenantId = evtObj['tenantId'];
            var digits = evtObj['digits'];
            var origCaller = evtObj['origCaller'];

            redisClient.get('SIPUSER_RESOURCE_MAP:' + transTenantId + ':' + transCompanyId + ':' + digits, function(err, objString)
            {
                var obj = JSON.parse(objString);

                if(obj && obj.Context)
                {
                    var nsObj = {
                        Ref: reqId,
                        To: obj.Issuer,
                        Timeout: 1000,
                        Direction: 'STATELESS',
                        From: 'CALLSERVER',
                        Callback: '',
                        Message: 'transfer_trying|' + reqId + '|OUTBOUND|' + caller + '|' + digits + '|OUTBOUND|outbound|call|' + origCaller + '|' + reqId
                    };

                    extApiAccess.SendNotificationInitiate(reqId, 'transfer_trying', reqId, nsObj, transCompanyId, transTenantId);

                    logger.debug('[DVP-EventMonitor.handler] - [%s] - SEND NOTIFICATION - AGENT TRANSFER TRYING - Message : ', reqId, nsObj.Message);


                }

            });

            break;

        case 'CUSTOM':

            if (evtObj['Event-Subclass'])
            {
                var subClass = evtObj['Event-Subclass'];
                if (subClass == 'conference::maintenance')
                {
                    logger.debug('[DVP-EventMonitor.handler] - [%s] - Event Data - EVENT_TYPE : ' + evtType + ', CHANNEL_STATE : ' + evtObj['Channel-State'] + ', SESSION_ID : ' + uniqueId + ', CALLER_UUID : ' + evtObj['Caller-Unique-ID'] + 'SWITCH NAME : ' + switchName, reqId);
                    redisClient.publish(subClass, event.serialize('json'), redisMessageHandler);
                    if (evtObj['Action'])
                    {

                        var action = evtObj['Action'];

                        var conferenceName = evtObj['Conference-Name'];
                        var conferenceSize = evtObj['Conference-Size'];
                        var conferenceID = evtObj['Conference-Unique-ID'];
                        var userID = evtObj['Member-ID'];
                        var userType = evtObj['Member-Type'];
                        var userName = evtObj['Caller-Username'];
                        var direction = evtObj['Caller-Direction'];


                        switch (action) {
                            case 'conference-create':
                                //results.event = 'create';
                                redisClient.hset('CONFERENCE:' + conferenceName, 'Conference-Unique-ID', conferenceID, redisMessageHandler);
                                redisClient.hset('CONFERENCE:' + conferenceName, 'Conference-Name', conferenceName, redisMessageHandler);
                                redisClient.hset('CONFERENCE:' + conferenceName, 'SwitchName', switchName, redisMessageHandler);
                                //redisClient.hset(conferenceID, 'Data', event.serialize('json'), redisMessageHandler);
                                if(conferenceName)
                                {
                                    dbOp.GetConferenceRoom(function(err, confInfo)
                                    {
                                        if(confInfo)
                                        {
                                            var nsObj = {
                                                Ref: conferenceID,
                                                Message: 'Conference member ' + userName + ' state is now listening'
                                            };

                                            extApiAccess.SendNotificationByKey(reqId, 'conference_create', conferenceID, 'CONFERENCE:' + conferenceName, nsObj, confInfo.CompanyId, confInfo.TenantId);

                                        }
                                    })
                                }

                                break;
                            case 'conference-destroy':
                                results.event = 'destroy';

                                redisClient.del('CONFERENCE-COUNT:' + conferenceName, redisMessageHandler);
                                redisClient.del('CONFERENCE-MEMBERS:' + conferenceName, userName, redisMessageHandler);
                                redisClient.del('CONFERENCE:' + conferenceName, redisMessageHandler);

                                if(conferenceName)
                                {
                                    dbOp.GetConferenceRoom(function(err, confInfo)
                                    {
                                        if(confInfo)
                                        {
                                            extApiAccess.SendNotificationByKey(reqId, 'conference_destroy', conferenceID, 'CONFERENCE:' + conferenceName, 'Conference room ' + conferenceName + ' closed', conferenceID, confInfo.CompanyId, confInfo.TenantId);

                                        }
                                    })
                                }



                                break;
                            case 'add-member':

                                //--------------

                                if(conferenceName)
                                {
                                    dbOp.GetConferenceRoom(function(err, confInfo)
                                    {
                                        if(confInfo)
                                        {
                                            extApiAccess.SendNotificationByKey(reqId, 'conference_member_joined', conferenceID, 'CONFERENCE:' + conferenceName, 'Conference member ' + userName + ' joined', conferenceID, confInfo.CompanyId, confInfo.TenantId);

                                        }
                                    })
                                }



                                redisClient.incr('CONFERENCE-COUNT:' + conferenceName, redisMessageHandler);
                                redisClient.sadd('CONFERENCE-MEMBERS:' + conferenceName, userName,  redisMessageHandler);


                                //------------
                                redisClient.hset("CONFERENCE-USER:" + userName, 'Caller-Username', userName, redisMessageHandler);
                                redisClient.hset("CONFERENCE-USER:" + userName, 'Member-Type', userType, redisMessageHandler);
                                redisClient.hset("CONFERENCE-USER:" + userName, 'Member-ID', userID, redisMessageHandler);
                                redisClient.hset("CONFERENCE-USER:" + userName, 'Member-State', 'JOINED', redisMessageHandler);
                                redisClient.hset("CONFERENCE-USER:" + userName, 'Caller-Direction', direction, redisMessageHandler);
                                redisClient.hset("CONFERENCE-USER:" + userName, 'Conference-Unique-ID', conferenceID, redisMessageHandler);

                                dbOp.SetConferenceMemberStatus(conferenceName, userName);


                                break;
                            case 'del-member':

                                if(conferenceName)
                                {
                                    dbOp.GetConferenceRoom(function(err, confInfo)
                                    {
                                        if(confInfo)
                                        {
                                            extApiAccess.SendNotificationByKey(reqId, 'conference_member_left', conferenceID, 'CONFERENCE:' + conferenceName, 'Conference member ' + userName + ' left', conferenceID, confInfo.CompanyId, confInfo.TenantId);

                                        }
                                    })
                                }

                                redisClient.decr('CONFERENCE-COUNT:' + conferenceName, redisMessageHandler);
                                redisClient.srem('CONFERENCE-MEMBERS:' + conferenceName, userName,  redisMessageHandler);

                                redisClient.del('CONFERENCE-USER:' + userName, redisMessageHandler);

                                break;
                            case 'start-talking':

                                if(conferenceName)
                                {
                                    dbOp.GetConferenceRoom(function(err, confInfo)
                                    {
                                        if(confInfo)
                                        {
                                            extApiAccess.SendNotificationByKey(reqId, 'conference_member_status', conferenceID, 'CONFERENCE:' + conferenceName, 'Conference member ' + userName + ' state is now talking', conferenceID, confInfo.CompanyId, confInfo.TenantId);

                                        }
                                    })
                                }


                                redisClient.hset("CONFERENCE-USER:" + userName, 'Member-State', 'TALKING', redisMessageHandler);

                                break;
                            case 'stop-talking':

                                if(conferenceName)
                                {
                                    dbOp.GetConferenceRoom(function(err, confInfo)
                                    {
                                        if(confInfo)
                                        {
                                            var nsObj = {
                                                Ref: conferenceID,
                                                Message: 'Conference member ' + userName + ' state is now listening'
                                            };
                                            extApiAccess.SendNotificationByKey(reqId, 'conference_member_status', conferenceID, 'CONFERENCE:' + conferenceName, 'Conference member ' + userName + ' state is now listening', nsObj, confInfo.CompanyId, confInfo.TenantId);

                                        }
                                    })
                                }

                                redisClient.hset("CONFERENCE-USER:" + userName, 'Member-State', 'LISTENING', redisMessageHandler);
                                break;
                            case 'bgdial-result':

                                break;

                        }
                    }


                }
                else if(subClass == 'callcenter::info')
                {
                    var action = evtObj['CC-Action'];
                    var agentState = evtObj['CC-Agent-State'];
                    var agent = evtObj['CC-Agent'];
                    var agentStatus = evtObj['CC-Agent-Status'];

                    logger.debug('[DVP-EventMonitor.handler] - [%s] - CUSTOM EVENT - EVENT-SUBCLASS : %s, CC-ACTION : %s, CC-AGENT : %s, AGENT-STATUS : %s, AGENT-STATE : %s', reqId, subClass, action, agent, agentStatus, agentState);

                    if(action)
                    {
                        if(action == 'agent-state-change')
                        {
                            //if(agentState)
                            //{
                            //    var agentSplitArr = agent.split('@');
                            //    var campId = '';

                            //    if(agentSplitArr.length == 2)
                            //    {
                            //        campId = agentSplitArr[1];
                            //    }

                            //    if(agentState == 'Waiting')
                            //    {
                            //increment
                            //        logger.debug('[DVP-EventMonitor.handler] - [%s] - ==================== INCREMENTING ====================', reqId);
                            //        extApiAccess.IncrementMaxChanLimit(reqId, campId, '',function(err, apiRes)
                            //        {

                            //       })
                            //    }
                            //    else if(agentState == 'Receiving')
                            //    {
                            //decrement
                            //        logger.debug('[DVP-EventMonitor.handler] - [%s] - ==================== DECREMENTING ====================', reqId);
                            //        extApiAccess.DecrementMaxChanLimit(reqId, campId, '', function(err, apiRes)
                            //        {

                            //        })
                            //    }
                            //}

                        }
                        else if(action == 'agent-status-change')
                        {
                            if(agentStatus)
                            {
                                var agentSplitArr = agent.split('@');
                                var campId = '';

                                if(agentSplitArr.length == 2)
                                {
                                    campId = agentSplitArr[1];
                                }

                                if(agentStatus == 'Available' || agentStatus == 'Logged Out' || agentStatus == 'On Break')
                                {
                                    extApiAccess.GetModCallCenterAgentCount(reqId, campId, function(err, fsResp)
                                    {
                                        if(fsResp)
                                        {
                                            var repStr = fsResp.replace('\n', '');
                                            logger.debug('[DVP-EventMonitor.handler] - [%s] - ==================== SET LIMIT ====================', reqId);
                                            extApiAccess.SetMaxChanLimit(reqId, campId, repStr, '',function(err, apiRes)
                                            {

                                            })
                                        }
                                    })

                                }

                            }
                        }
                    }

                }

                else if (subClass.indexOf('valet_parking::') > -1) {

                    redisClient.publish(subClass, event.serialize('json'), redisMessageHandler);

                    //console.log(event.getHeader("Action"));
                    var key = util.format("Park-%s-%s", evtObj['Valet-Lot-Name'], evtObj['Valet-Extension']);

                    switch (evtObj["Action"]) {
                        case "hold":
                            redisClient.set(key, event.serialize('json'), redisMessageHandler);
                            break;

                        case "bridge":
                            break;

                        case "exit":
                            redisClient.del(key, redisMessageHandler);
                            break;
                    }


                }
                else if (subClass.indexOf('spandsp::') > -1) {

                    switch (subClass) {
                        case 'spandsp::txfaxresult':

                            //console.log(event.getHeader("fax-result-text"));

                            break;

                        case 'spandsp::rxfaxresult':

                            //console.log(event.getHeader("fax-result-text"));

                            break;

                    }
                }
                else if (subClass.indexOf('sofia::') > -1) {

                    //redisClient.publish(subClass, event.serialize('json'), redis.print);
                    var username = evtObj['from-user'];
                    var realm = evtObj['from-host'];


                    switch (subClass) {

                        case 'sofia::register':

                            logger.debug('[DVP-EventMonitor.handler] - [%s] - Event Data - EVENT_TYPE : ' + evtType + ', CHANNEL_STATE : ' + evtObj['Channel-State'] + ', SESSION_ID : ' + uniqueId + ', CALLER_UUID : ' + evtObj['Caller-Unique-ID'] + 'SWITCH NAME : ' + switchName, reqId);

                            dbOp.getUserDetailsByDomain(username, realm, function(err, usr)
                            {
                                var presObj = {
                                    SipUsername: username,
                                    Domain: realm,
                                    Status: 'REGISTERED'
                                };

                                if(usr && usr.Extension && usr.Extension.Extension)
                                {
                                    presObj.Extension = usr.Extension.Extension;
                                }

                                redisClient.set('SIPPRESENCE:' + realm + ':' + username, JSON.stringify(presObj), redisMessageHandler);

                                if(usr && usr.GuRefId)
                                {
                                    logger.debug('USER REF ID FOUND');
                                    mongoAccessor.getUserAccountData(usr.CompanyId, usr.TenantId, usr.GuRefId, function(err, usrData)
                                    {
                                        if(usrData)
                                        {
                                            logger.debug('USER DATA FOUND ON MONGO');
                                            var key = 'SIPUSER_RESOURCE_MAP:' + usr.TenantId + ':' + usr.CompanyId + ':' + username;

                                            var obj = {
                                                SipURI: username + '@' + realm,
                                                Context: usr.ContextId,
                                                Issuer : usrData.user,
                                                CompanyId : usr.CompanyId,
                                                TenantId : usr.TenantId,
                                                ResourceId: usrData.resource_id
                                            };

                                            redisClient.set(key, JSON.stringify(obj), redisMessageHandler);

                                            if(usr.Extension && usr.Extension.Extension)
                                            {
                                                var extkey = 'EXTENSION_RESOURCE_MAP:' + usr.TenantId + ':' + usr.CompanyId + ':' + usr.Extension.Extension;

                                                redisClient.set(extkey, JSON.stringify(obj), redisMessageHandler);
                                            }
                                        }
                                        else {
                                            logger.debug('USER DATA NOT FOUND ON MONGO');
                                        }
                                    })
                                }



                            });


                            break;

                        case 'sofia::expire':
                            logger.debug('[DVP-EventMonitor.handler] - [%s] - Event Data - EVENT_TYPE : ' + evtType + ', CHANNEL_STATE : ' + evtObj['Channel-State'] + ', SESSION_ID : ' + uniqueId + ', CALLER_UUID : ' + evtObj['Caller-Unique-ID'] + 'SWITCH NAME : ' + switchName, reqId);
                            redisClient.del('SIPPRESENCE:' + realm + ':' + username, redisMessageHandler);


                            break;

                        case 'sofia::unregister':
                            logger.debug('[DVP-EventMonitor.handler] - [%s] - Event Data - EVENT_TYPE : ' + evtType + ', CHANNEL_STATE : ' + evtObj['Channel-State'] + ', SESSION_ID : ' + uniqueId + ', CALLER_UUID : ' + evtObj['Caller-Unique-ID'] + 'SWITCH NAME : ' + switchName, reqId);
                            redisClient.del('SIPPRESENCE:' + realm + ':' + username, redisMessageHandler);


                            break;
                        case 'sofia::gateway_add':
                            redisClient.set('TRUNK_AVAILABILITY:' + evtObj['Gateway'], JSON.stringify(evtObj), redisMessageHandler);
                            notifyGatewayStatus(reqId, 'gateway_add', evtObj);
                            break;
                        case 'sofia::gateway_delete':
                            redisClient.del('TRUNK_AVAILABILITY:' + evtObj['Gateway'], redisMessageHandler);
                            notifyGatewayStatus(reqId, 'gateway_delete', evtObj);
                            break;
                        case 'sofia::gateway_state':
                            redisClient.set('TRUNK_AVAILABILITY:' + evtObj['Gateway'], JSON.stringify(evtObj), redisMessageHandler);
                            //notifyGatewayStatus(reqId, 'gateway_state', evtObj);
                            break;

                    }

                }
                else if(subClass == 'ards::info')
                {

                    logger.debug('[DVP-EventMonitor.handler] - [%s] - Event Data - EVENT_TYPE : ' + evtType + ', CHANNEL_STATE : ' + evtObj['Channel-State'] + ', SESSION_ID : ' + uniqueId + ', CALLER_UUID : ' + evtObj['Caller-Unique-ID'] + 'SWITCH NAME : ' + switchName, reqId);

                    var action = evtObj['ARDS-Action'];

                    var ardsClientUuid = evtObj['ARDS-Call-UUID'];
                    var ardsCompany = evtObj['Company'];
                    var ardsTenant = evtObj['Tenant'];
                    var ardsServerType = evtObj['ServerType'];
                    var ardsReqType = evtObj['RequestType'];
                    var ardsResourceId = evtObj['ARDS-Resource-Id'];
                    var reason = evtObj['ARDS-Reason'];
                    var skill = evtObj['ARDS-Call-Skill'];

                    var obj = {
                        ServerType : ardsServerType,
                        ReqType: ardsReqType,
                        ResourceId: ardsResourceId,
                        Reason: reason,
                        Skill: skill
                    };

                    evtData.SessionId = ardsClientUuid;
                    evtData.EventClass = "ARDS";
                    evtData.EventType = "EVENT";
                    evtData.EventCategory = "SYSTEM";
                    evtData.EventName = action;
                    evtData.EventData = skill;
                    evtData.CompanyId = ardsCompany;
                    evtData.TenantId = ardsTenant;
                    evtData.EventParams = obj;



                    if(action === 'agent-rejected')
                    {
                        ardsHandler.SendResourceStatus(reqId, ardsClientUuid, ardsCompany, ardsTenant, ardsServerType, ardsReqType, ardsResourceId, 'Reject', 'Reject', reason, 'inbound', 'default');


                        var evResource =  evtObj['ARDS-Resource-Name'];
                        var eventParam = util.format("The call is rejected by %s", evResource);
                        evtData.EventParams = eventParam;
                        /*var jsonStr = JSON.stringify(evtData);
                        redisClient.publish('SYS:MONITORING:DVPEVENTS', jsonStr);*/
                        dvpEventHandler.PublishDVPEventsMessage(evtData);
                    }
                    else if(action === 'agent-connected')
                    {
                        var evResource =  evtObj['ARDS-Resource-Name'];
                        var eventParam = util.format("The call is answered by %s", evResource);
                        evtData.EventParams = eventParam;
                        /*var jsonStr = JSON.stringify(evtData);
                        redisClient.publish('SYS:MONITORING:DVPEVENTS', jsonStr);*/
                        dvpEventHandler.PublishDVPEventsMessage(evtData);

                    }
                    else if(action === 'agent-disconnected')
                    {
                        var evResource =  evtObj['ARDS-Resource-Name'];
                        var eventParam = util.format("The call is disconnected by %s", evResource);
                        evtData.EventParams = eventParam;
                        /*var jsonStr = JSON.stringify(evtData);
                        redisClient.publish('SYS:MONITORING:DVPEVENTS', jsonStr);*/
                        dvpEventHandler.PublishDVPEventsMessage(evtData);

                    }
                    else if(action === 'ards-added')
                    {
                        var evResource =  evtObj['ARDS-Call-Skill'];
                        var eventParam = util.format("The call is added to %s queue", evResource);
                        evtData.EventParams = eventParam;
                        /*var jsonStr = JSON.stringify(evtData);
                        redisClient.publish('SYS:MONITORING:DVPEVENTS', jsonStr);*/
                        dvpEventHandler.PublishDVPEventsMessage(evtData);

                    }
                    else if(action === 'client-left')
                    {
                        /*var jsonStr = JSON.stringify(evtData);
                        redisClient.publish('SYS:MONITORING:DVPEVENTS', jsonStr);*/
                        dvpEventHandler.PublishDVPEventsMessage(evtData);

                    }
                    else if(action === 'agent-found')
                    {
                        var evResource =  evtObj['ARDS-Resource-Name'];
                        var eventParam = util.format("%s is selected to route the request", evResource);
                        evtData.EventParams = eventParam;
                        /*var jsonStr = JSON.stringify(evtData);
                        redisClient.publish('SYS:MONITORING:DVPEVENTS', jsonStr);*/
                        dvpEventHandler.PublishDVPEventsMessage(evtData);

                    }else{

                        /*var jsonStr = JSON.stringify(evtData);
                        redisClient.publish('SYS:MONITORING:DVPEVENTS', jsonStr);*/
                        dvpEventHandler.PublishDVPEventsMessage(evtData);

                    }

                }

                return;
            }
            break;
        //default:

    }

}

var handler = function (event, header, body)
{
    var reqId = nodeUuid.v1();

    try
    {

        if (header)
        {
            //logger.info('[DVP-EventMonitor.handler] - [%s] - FS EVENT RECEIVED', reqId);

            var evtObj = {};

            evtObj['Event-Name'] = event.type;
            evtObj['Unique-ID'] = event.getHeader('Unique-ID');
            evtObj['variable_CustomCompanyStr'] = event.getHeader('variable_CustomCompanyStr');
            evtObj['variable_DVP_CUSTOM_PUBID'] = event.getHeader('variable_DVP_CUSTOM_PUBID');
            evtObj['variable_CampaignId'] = event.getHeader('variable_CampaignId');
            evtObj['variable_companyid'] = event.getHeader('variable_companyid');
            evtObj['variable_business_unit'] = event.getHeader('variable_business_unit');
            evtObj['variable_tenantid'] = event.getHeader('variable_tenantid');
            evtObj['variable_veeryoperator'] = event.getHeader('variable_veeryoperator');
            evtObj['Event-Date-Timestamp'] = event.getHeader("Event-Date-Timestamp");
            evtObj['FreeSWITCH-Switchname'] = event.getHeader('FreeSWITCH-Switchname');
            evtObj['Caller-Destination-Number'] = event.getHeader('Caller-Destination-Number');
            evtObj['ARDS-Action'] = event.getHeader('ARDS-Action');
            evtObj['ards_client_uuid'] = event.getHeader('ards_client_uuid');
            evtObj['variable_dvp_app_id'] = event.getHeader('variable_dvp_app_id');
            evtObj['variable_application_type'] = event.getHeader('variable_application_type');
            evtObj['variable_application_position'] = event.getHeader('variable_application_position');
            evtObj['Caller-Caller-ID-Number'] = event.getHeader('Caller-Caller-ID-Number');
            evtObj['Caller-Caller-ID-Name'] = event.getHeader('Caller-Caller-ID-Name');
            evtObj['Call-Direction'] = event.getHeader('Call-Direction');
            evtObj['variable_DVP_CALL_DIRECTION'] = event.getHeader('variable_DVP_CALL_DIRECTION');
            evtObj['variable_DVP_CALLMONITOR_OTHER_LEG'] = event.getHeader('variable_DVP_CALLMONITOR_OTHER_LEG');
            evtObj['Other-Leg-Unique-ID'] = event.getHeader('Other-Leg-Unique-ID');
            evtObj['Caller-Orig-Caller-ID-Name'] = event.getHeader('Caller-Orig-Caller-ID-Name');
            evtObj['Caller-Orig-Caller-ID-Number'] = event.getHeader('Caller-Orig-Caller-ID-Number');
            evtObj['variable_DVP_OPERATION_CAT'] = event.getHeader('variable_DVP_OPERATION_CAT');
            evtObj['variable_DVP_ACTION_CAT'] = event.getHeader('variable_DVP_ACTION_CAT');
            evtObj['variable_ARDS-Resource-Id'] = event.getHeader('variable_ARDS-Resource-Id');
            evtObj['Caller-Context'] = event.getHeader('Caller-Context');
            evtObj['Channel-State'] = event.getHeader('Channel-State');
            evtObj['Caller-Unique-ID'] = event.getHeader('Caller-Unique-ID');
            evtObj['variable_ards_resource_id'] = event.getHeader('variable_ards_resource_id');
            evtObj['variable_ards_skill_display'] = event.getHeader('variable_ards_skill_display');
            evtObj['Caller-Channel-Bridged-Time'] = event.getHeader('Caller-Channel-Bridged-Time');
            evtObj['variable_ards_client_uuid'] = event.getHeader('variable_ards_client_uuid');
            evtObj['Other-Leg-Direction'] = event.getHeader('Other-Leg-Direction');
            evtObj['Other-Leg-Caller-ID-Number'] = event.getHeader('Other-Leg-Caller-ID-Number');
            evtObj['Other-Leg-Callee-ID-Number'] = event.getHeader('Other-Leg-Callee-ID-Number');
            evtObj['Other-Leg-Context'] = event.getHeader('Other-Leg-Context');
            evtObj['variable_fifo_bridge_uuid'] = event.getHeader('variable_fifo_bridge_uuid');
            evtObj['Channel-Call-State'] = event.getHeader('Channel-Call-State');
            evtObj['Channel-Name'] = event.getHeader('Channel-Name');
            evtObj['Channel-Presence-ID'] = event.getHeader('Channel-Presence-ID');
            evtObj['variable_sip_gateway_name'] = event.getHeader("variable_sip_gateway_name");
            evtObj['variable_loopback_app'] = event.getHeader("variable_loopback_app");
            evtObj['variable_sip_auth_realm'] = event.getHeader("variable_sip_auth_realm");
            evtObj['Channel-Call-UUID'] = event.getHeader('Channel-Call-UUID');
            evtObj['variable_ards_servertype'] = event.getHeader('variable_ards_servertype');
            evtObj['variable_ards_requesttype'] = event.getHeader('variable_ards_requesttype');
            evtObj['FreeSWITCH-Hostname'] = event.getHeader('FreeSWITCH-Hostname');
            evtObj['FreeSWITCH-IPv4'] = event.getHeader('FreeSWITCH-IPv4');
            evtObj['Up-Time'] = event.getHeader('Up-Time');
            evtObj['FreeSWITCH-Version'] = event.getHeader('FreeSWITCH-Version');
            evtObj['Uptime-msec'] = event.getHeader('Uptime-msec');
            evtObj['Session-Count'] = event.getHeader('Session-Count');
            evtObj['Max-Sessions'] = event.getHeader('Max-Sessions');
            evtObj['Session-Per-Sec'] = event.getHeader('Session-Per-Sec');
            evtObj['Session-Per-Sec-Max'] = event.getHeader('Session-Per-Sec-Max');
            evtObj['Session-Since-Startup'] = event.getHeader('Session-Since-Startup');
            evtObj['Idle-CPU'] = event.getHeader('Idle-CPU');
            evtObj['variable_origination_caller_id_number'] = event.getHeader('variable_origination_caller_id_number');
            evtObj['variable_originating_leg_uuid'] = event.getHeader('variable_originating_leg_uuid');
            evtObj['Hangup-Cause'] = event.getHeader('Hangup-Cause');
            evtObj['from'] = event.getHeader('from');
            evtObj['status'] = event.getHeader('status');
            evtObj['Event-Subclass'] = event.getHeader('Event-Subclass');
            evtObj['Action'] = event.getHeader('Action');
            evtObj['Conference-Name'] = event.getHeader('Conference-Name');
            evtObj['Conference-Size'] = event.getHeader('Conference-Size');
            evtObj['Conference-Unique-ID'] = event.getHeader('Conference-Unique-ID');
            evtObj['Member-ID'] = event.getHeader('Member-ID');
            evtObj['Member-Type'] = event.getHeader('Member-Type');
            evtObj['Caller-Username'] = event.getHeader('Caller-Username');
            evtObj['Caller-Direction'] = event.getHeader('Caller-Direction');
            evtObj['CC-Action'] = event.getHeader('CC-Action');
            evtObj['CC-Agent-State'] = event.getHeader('CC-Agent-State');
            evtObj['CC-Agent'] = event.getHeader('CC-Agent');
            evtObj['CC-Agent-Status'] = event.getHeader('CC-Agent-Status');
            evtObj['Valet-Lot-Name'] = event.getHeader('Valet-Lot-Name');
            evtObj['Valet-Extension'] = event.getHeader('Valet-Extension');
            evtObj['from-user'] = event.getHeader('from-user');
            evtObj['from-host'] = event.getHeader('from-host');
            evtObj['ARDS-Call-UUID'] = event.getHeader('ARDS-Call-UUID');
            evtObj['Company'] = event.getHeader('Company');
            evtObj['Tenant'] = event.getHeader('Tenant');
            evtObj['ServerType'] = event.getHeader('ServerType');
            evtObj['RequestType'] = event.getHeader('RequestType');
            evtObj['ARDS-Resource-Id'] = event.getHeader('ARDS-Resource-Id');
            evtObj['ARDS-Reason'] = event.getHeader('ARDS-Reason');
            evtObj['ARDS-Call-Skill'] = event.getHeader('ARDS-Call-Skill');


            eventHandler(reqId, evtObj);


        }
    }
    catch (e)
    {
        logger.error('[DVP-EventMonitor.handler] - [%s] - Exception on handler ', reqId, e);
    }

};

var flag = true;
var conn;

var errorHandler = function(err)
{
    logger.error('Error occurred', err);
    //CreateESLWithTimeout();
    flag = true;

};

var connectionHandler = function()
{
    logger.debug('CONNECTION END');
    //CreateESLWithTimeout();
    flag = true;
};

var connectionReadyHandler = function()
{
    logger.debug('CONNECTION READY');
};

var CreateESLWithTimeout = function()
{
    setTimeout(CreateESLConnection, 5000);
};

var CreateESLConnection = function()
{
    tcpp.probe(freeswitchIp, fsPort, function(err, available)
    {
        if(available === true)
        {
            if(flag)
            {
                //set connection
                logger.debug('CONNECTION CAN BE ESTABLISHED');
                //set flag to stop
                try
                {
                    flag = false;
                    logger.debug('CREATING ESL CONNECTION');
                    if(conn == null || conn.socket == null || conn.socket.destroyed)
                    {
                        conn = new esl.Connection(freeswitchIp, fsPort, fsPassword, function()
                        {
                            try
                            {
                                conn.subscribe(/*['CHANNEL_CREATE',
                                 'CHANNEL_CALLSTATE',
                                 'CHANNEL_STATE',
                                 'CHANNEL_EXECUTE',
                                 'CHANNEL_EXECUTE_COMPLETE',
                                 'CHANNEL_DESTROY',
                                 'CHANNEL_PARK',
                                 'CHANNEL_ANSWER',
                                 'CHANNEL_UNBRIDGE',
                                 'CHANNEL_BRIDGE',
                                 'RECV_INFO',
                                 'MESSAGE',
                                 'DTMF',
                                 'CHANNEL_EXECUTE_COMPLETE',
                                 'PLAYBACK_STOP',
                                 'CHANNEL_HANGUP_COMPLETE',
                                 'RECORD_STOP',
                                 'CHANNEL_DATA',
                                 'CUSTOM',
                                 'HEARTBEAT',
                                 'conference::maintenance',
                                 'sofia::register',
                                 'sofia::pre_register',
                                 'sofia::register_attempt',
                                 'sofia::register_failure',
                                 'sofia::unregister',
                                 'sofia::expire',
                                 'sofia::gateway_add',
                                 'sofia::gateway_delete',
                                 'sofia::gateway_state',
                                 'fifo:info',
                                 'valet_parking::info',
                                 'spandsp::txfaxresult',
                                 'spandsp::rxfaxresult']*/['all'], function () {

                                    conn.on('esl::event::**', handler);
                                    conn.on('error', errorHandler);
                                    conn.on('esl::end', connectionHandler);
                                    conn.on('esl::ready', connectionReadyHandler);
                                    logger.info('[DVP-EventMonitor.AppStart] - Subscribed to FS Events.....');
                                    flag = false;
                                    CreateESLWithTimeout();
                                });

                            }
                            catch (ex)
                            {
                                logger.error('ERROR OCCURRED', ex);
                            }

                        });
                    }
                    else
                    {
                        CreateESLWithTimeout();
                    }

                }
                catch(ex)
                {
                    logger.error('ERROR OCCURRED', ex);
                }
            }
            else
            {
                //retry
                CreateESLWithTimeout();
            }


        }
        else
        {
            //retry
            logger.debug('CONNECTION CANNOT BE ESTABLISHED - RETRYING');
            flag = true;
            CreateESLWithTimeout();
        }
    });



};

if(evtConsumeType)
{
    if(evtConsumeType === 'esl')
    {
        CreateESLWithTimeout();
    }
    else if(evtConsumeType === 'amqp')
    {
        var amqpConState = 'CLOSED';

        // var connection = amqp.createConnection({ host: rmqIp, port: rmqPort, login: rmqUser, password: rmqPassword});

        var ips = [];
        if(config.RabbitMQ.ip) {
            ips = config.RabbitMQ.ip.split(",");
        }


        var connection = amqp.createConnection({
            //url: queueHost,
            host: ips,
            port: config.RabbitMQ.port,
            login: config.RabbitMQ.user,
            password: config.RabbitMQ.password,
            vhost: config.RabbitMQ.vhost,
            noDelay: true,
            heartbeat:10
        }, {
            reconnect: true,
            reconnectBackoffStrategy: 'linear',
            reconnectExponentialLimit: 120000,
            reconnectBackoffTime: 1000
        });

        //logger.debug('[DVP-EventMonitor.handler] - [%s] - AMQP Creating connection ' + rmqIp + ' ' + rmqPort + ' ' + rmqUser + ' ' + rmqPassword);

        connection.on('connect', function()
        {
            amqpConState = 'CONNECTED';
            logger.debug('[DVP-EventMonitor.handler] - [%s] - AMQP Connection CONNECTED');
        });

        connection.on('ready', function()
        {
            amqpConState = 'READY';

            logger.debug('[DVP-EventMonitor.handler] - [%s] - AMQP Connection READY');

            connection.queue('FS_EVENTS', {durable: true, autoDelete: false}, function (q) {
                q.bind('#');

                // Receive messages
                q.subscribe(function (message) {
                    // Print messages to stdout
                    var reqId = nodeUuid.v1();
                    eventHandler(reqId, message);


                });

            });
        });

        connection.on('error', function(e)
        {
            logger.error('[DVP-EventMonitor.handler] - [%s] - AMQP Connection ERROR', e);
            amqpConState = 'CLOSE';
        });
    }
    else
    {
        CreateESLWithTimeout();
    }
}
else
{
    CreateESLWithTimeout();
}

process.stdin.resume();
