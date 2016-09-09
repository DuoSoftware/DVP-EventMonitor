var esl = require('modesl');
var redis = require('redis');
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

var winston = require('winston');

var loggerCust = new winston.Logger();

var level = 'debug';

loggerCust.add(winston.transports.File, {filename: 'logs/common_logger.log', level: level, maxsize:1242880, maxFiles:10});

//open a connection
var redisPort = config.Redis.port;
var redisIp = config.Redis.ip;
var redisPass = config.Redis.password;
var freeswitchIp = config.Freeswitch.ip;
var fsPort = config.Freeswitch.port;
var fsPassword = config.Freeswitch.password;
var fsHttpPort = config.Freeswitch.httport;

var redisClient = redis.createClient(redisPort,redisIp);

redisClient.auth(redisPass, function (err) {
    console.log("Error Authenticating Redis : " + err);
});


redisClient.on('error',function(err){

    });


    var redisMessageHandler = function (err, reply)
    {
        if (err)
        {
            logger.error('[DVP-EventMonitor.handler] - REDIS ERROR', err);
        }
        else
        {
            logger.debug('[DVP-EventMonitor.handler] - REDIS SUCCESS');
        }
    };

    var handler = function (event, header, body)
    {
        var reqId = nodeUuid.v1();

        try
        {

            if (header)
            {
                logger.info('[DVP-EventMonitor.handler] - [%s] - FS EVENT RECEIVED', reqId);

                var evtType = event.type;
                var uniqueId = event.getHeader('Unique-ID');
                var customCompanyStr = event.getHeader('variable_CustomCompanyStr');
                var dvpCustPubId = event.getHeader('variable_DVP_CUSTOM_PUBID');
                var campaignId = event.getHeader('variable_CampaignId');
                var companyId = event.getHeader('variable_companyid');
                var tenantId = event.getHeader('variable_tenantid');
                var variableEvtTime = event.getHeader("Event-Date-Timestamp");
                var switchName = event.getHeader('FreeSWITCH-Switchname');
                var chanCountInstance = 'DVP_CHANNEL_COUNT_INSTANCE:' + switchName;
                var callCountInstance = 'DVP_CALL_COUNT_INSTANCE:' + switchName;
                var callCountCompany = 'DVP_CALL_COUNT_COMPANY:' + tenantId + ':' + companyId;
                var chanCountCompany = 'DVP_CHANNEL_COUNT_COMPANY:' + tenantId + ':' + companyId;
                var callerDestNum = event.getHeader('Caller-Destination-Number');
                var ardsAction = event.getHeader('ARDS-Action');
                var ardsClientUuid = event.getHeader('ards_client_uuid');
                var dvpAppId = event.getHeader('variable_dvp_app_id');
                var appType = event.getHeader('variable_application_type');
                var appPosition = event.getHeader('variable_application_position');
                var callerIdNum = event.getHeader('Caller-Caller-ID-Number');
                var callerIdName = event.getHeader('Caller-Caller-ID-Name');
                var direction = event.getHeader('Call-Direction');
                var dvpCallDirection = event.getHeader('variable_DVP_CALL_DIRECTION');
                var callMonitorOtherLeg = event.getHeader('variable_DVP_CALLMONITOR_OTHER_LEG');
                var otherLegUniqueId = event.getHeader('Other-Leg-Unique-ID');

                loggerCust.debug('EVENT RECEIVED - [UUID : %s , TYPE : %s, CompanyId : %s', uniqueId, evtType, companyId);



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
                        redisClient.hset(uniqueId, 'DVP-Call-Direction', dvpCallDirection, redisMessageHandler);
                    }


                    if(appType)
                    {
                        redisClient.hset(uniqueId, 'Application-Type', appType, redisMessageHandler);
                    }

                    if(appPosition)
                    {
                        redisClient.hset(uniqueId, 'Application-Position', appPosition, redisMessageHandler);
                    }
                }

                var eventTime = '';

                if(ardsClientUuid)
                {
                    uniqueId = ardsClientUuid;
                }

                logger.debug('[DVP-EventMonitor.handler] - [%s] - Event Data - EVENT_TYPE : ' + evtType + ', CHANNEL_STATE : ' + event.getHeader('Channel-State') + ', SESSION_ID : ' + uniqueId + ', CALLER_UUID : ' + event.getHeader('Caller-Unique-ID') + 'SWITCH NAME : ' + switchName, reqId);

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
                    CampaignId: campaignId,
                    CallerDestNum: callerDestNum,
                    EventParams: "",
                    CompanyId: companyId,
                    TenantId: tenantId
                };

                switch (evtType)
                {
                    case 'ARDS_EVENT':

                        evtData.EventCategory = ardsAction;

                        var jsonStr = JSON.stringify(evtData);

                        if(dvpCustPubId)
                        {
                            redisClient.publish(dvpCustPubId, jsonStr);
                            //logger.debug('[DVP-EventMonitor.handler] - [%s] - REDIS PUBLISH CUSTOM: %s', reqId, jsonStr);
                        }
                        else
                        {
                            redisClient.publish('SYS:MONITORING:DVPEVENTS', jsonStr);
                            //logger.debug('[DVP-EventMonitor.handler] - [%s] - REDIS PUBLISH DVPEVENTS: %s', reqId, jsonStr);
                        }

                        redisClient.hset(uniqueId, 'ARDS-State', ardsAction, redisMessageHandler);
                        break;

                    case 'OUTGOING_CHANNEL':

                        break;

                    case 'CHANNEL_BRIDGE':

                        redisClient.incr(callCountInstance, redisMessageHandler);
                        redisClient.incr(callCountCompany, redisMessageHandler);

                        var pubMessage = util.format("EVENT:%s:%s:%s:%s:%s:%s:%s:%s:YYYY", tenantId, companyId, "CALLSERVER", "CALL", "BRIDGE", "", "", uniqueId);

                        redisClient.publish('events', pubMessage);

                        evtData.EventCategory = "CHANNEL_BRIDGE";

                        var jsonStr = JSON.stringify(evtData);

                        if(dvpCustPubId)
                        {
                            redisClient.publish(dvpCustPubId, jsonStr);
                            //logger.debug('[DVP-EventMonitor.handler] - [%s] - REDIS PUBLISH CUSTOM: %s', reqId, jsonStr);
                        }
                        else
                        {
                            redisClient.publish('SYS:MONITORING:DVPEVENTS', jsonStr);
                            //logger.debug('[DVP-EventMonitor.handler] - [%s] - REDIS PUBLISH DVPEVENTS: %s', reqId, jsonStr);
                        }

                        redisClient.hset(uniqueId, 'Bridge-State', 'Bridged', redisMessageHandler);

                        if(otherLegUniqueId)
                        {
                            redisClient.hset(uniqueId, 'Other-Leg-Unique-ID', otherLegUniqueId, redisMessageHandler);
                        }

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

                            if (event.getHeader('variable_fifo_bridge_uuid'))
                            {
                                redisClient.hset(uniqueId, 'Other-Leg-Unique-ID', event.getHeader('variable_fifo_bridge_uuid'), redisMessageHandler);
                                redisClient.hset(uniqueId, 'Call-Type', 'FIFO', redisMessageHandler);
                            }
                        }

                    }
                        //redisClient.hset(uniqueId, 'data', event.serialize('json'), redisMessageHandler);
                        redisClient.hset(uniqueId, 'Channel-Call-State', event.getHeader('Channel-Call-State'), redisMessageHandler);

                        break;

                    case 'CHANNEL_CREATE':

                        var channelState = event.getHeader('Channel-State');
                        var channelName = event.getHeader('Channel-Name');

                        var callerUniqueId = event.getHeader('Caller-Unique-ID');
                        var fifoBridgeUuid = event.getHeader('variable_fifo_bridge_uuid');
                        var channelPresId = event.getHeader('Channel-Presence-ID');
                        var channelCallState = event.getHeader('Channel-Call-State');
                        var sipGatewayName = event.getHeader("variable_sip_gateway_name");
                        var variableLoopbackApp = event.getHeader("variable_loopback_app");
                        var variableSipAuthRealm = event.getHeader("variable_sip_auth_realm");


                        //Sending Resource Status For Agent Outbound Calls

                        var callerContext = event.getHeader('Caller-Context');
                        var sipFromUri = event.getHeader('variable_sip_from_uri');

                        if(direction === 'outbound' && companyId && tenantId)
                        {

                            var callerOrigIdName = event.getHeader('Caller-Orig-Caller-ID-Name');
                            var callerOrigIdNumber = event.getHeader('Caller-Orig-Caller-ID-Number');

                            redisClient.get('SIPUSER_RESOURCE_MAP:' + tenantId + ':' + companyId + ':' + callerOrigIdName, function(err, objString)
                            {
                                var obj = JSON.parse(objString);

                                if(obj && obj.Context && callerContext === obj.Context)
                                {
                                    ardsHandler.SendResourceStatus(reqId, uniqueId, obj.CompanyId, obj.TenantId, '', '', obj.ResourceId, 'Connected', '', '', 'outbound');

                                    var nsObj = {
                                        Ref: uniqueId,
                                        To: obj.Issuer,
                                        Timeout: 1000,
                                        Direction: 'STATELESS',
                                        From: 'CALLSERVER',
                                        Callback: '',
                                        Message: 'agent_found|' + uniqueId + '|OUTBOUND|' + callerDestNum + '|' + callerDestNum + '|' + callerOrigIdName + '|OUTBOUND|outbound'
                                    };

                                    extApiAccess.SendNotificationInitiate(reqId, 'agent_found', uniqueId, nsObj, obj.CompanyId, obj.TenantId);


                                }

                            })
                        }

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

                        var jsonStr = JSON.stringify(evtData);
                        if(dvpCustPubId)
                        {
                            redisClient.publish(dvpCustPubId, jsonStr);
                            //logger.debug('[DVP-EventMonitor.handler] - [%s] - REDIS PUBLISH CUSTOM : CHANNEL : %s , DATA : %s', reqId, dvpCustPubId, jsonStr);
                        }
                        else
                        {
                            redisClient.publish('SYS:MONITORING:DVPEVENTS', jsonStr);
                            //logger.debug('[DVP-EventMonitor.handler] - [%s] - REDIS PUBLISH DVPEVENTS: %s', reqId, jsonStr);
                        }

                        var channelSetName = "CHANNELS:" + tenantId + ":" + companyId;

                        if(companyId && tenantId)
                        {
                            redisClient.sadd(channelSetName, uniqueId, redisMessageHandler);

                            var pubMessage = util.format("EVENT:%s:%s:%s:%s:%s:%s:%s:%s:YYYY", tenantId, companyId, "CALLSERVER", "CHANNEL", "CREATE", "", "", uniqueId);

                            redisClient.publish('events', pubMessage);

                            logger.debug('=========================== ADD TO SET : [%s] - [%s] ==========================', channelSetName, uniqueId);
                        }
                        else
                        {
                            logger.debug('=========================== ADD TO SET - COMPANY NOT SET : [%s] ==========================', channelSetName, uniqueId);
                        }

                        if (!variableLoopbackApp)
                        {
                            redisClient.hset(uniqueId, 'Unique-ID', uniqueId, redisMessageHandler);
                            redisClient.hset(uniqueId, 'Channel-State', channelState, redisMessageHandler);
                            redisClient.hset(uniqueId, 'FreeSWITCH-Switchname', switchName, redisMessageHandler);
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
                        if (event.getHeader('Channel-State') != 'CS_DESTROY')
                        {
                            logger.debug('[DVP-EventMonitor.handler] - [%s] - REDIS GET');
                            redisClient.hset(uniqueId, 'Channel-State', event.getHeader('Channel-State'), redisMessageHandler);
                        }
                        else
                        {
                            redisClient.del(uniqueId, redisMessageHandler);
                        }
                        break;

                    case 'CHANNEL_HOLD':

                        break;
                    case 'CHANNEL_UNHOLD':

                        break;
                    case 'CHANNEL_ANSWER':

                        var ardsClientUuid = event.getHeader('variable_ards_client_uuid');
                        var ardsCompany = event.getHeader('variable_companyid');
                        var ardsTenant = event.getHeader('variable_tenantid');
                        var ardsServerType = event.getHeader('variable_ards_servertype');
                        var ardsReqType = event.getHeader('variable_ards_requesttype');
                        var ardsResourceId = event.getHeader('variable_ards_resource_id');


                        //Sending Resource Status For Agent Outbound Calls

                        var callerContext = event.getHeader('Caller-Context');

                        /*if(direction === 'outbound' && companyId && tenantId)
                        {

                            var callerOrigIdName = event.getHeader('Caller-Orig-Caller-ID-Name');

                            redisClient.get('SIPUSER_RESOURCE_MAP:' + tenantId + ':' + companyId + ':' + callerOrigIdName, function(err, objString)
                            {

                                var obj = JSON.parse(objString);

                                if(obj && obj.Context && callerContext === obj.Context)
                                {
                                    ardsHandler.SendResourceStatus(reqId, uniqueId, obj.CompanyId, obj.TenantId, '', '', obj.ResourceId, 'Connected', '', '');

                                }

                            })
                        }*/

                        if(ardsClientUuid)
                        {
                            ardsHandler.SendResourceStatus(reqId, ardsClientUuid, ardsCompany, ardsTenant, ardsServerType, ardsReqType, ardsResourceId, 'Connected', '', '', 'inbound');
                        }


                        evtData.EventCategory = "CHANNEL_ANSWER";

                        var jsonStr = JSON.stringify(evtData);
                        logger.debug('[DVP-EventMonitor.handler] - [%s] - REDIS PUBLISH');
                        if(dvpCustPubId)
                        {
                            redisClient.publish(dvpCustPubId, jsonStr);
                        }
                        else
                        {
                            redisClient.publish('SYS:MONITORING:DVPEVENTS', jsonStr);
                        }

                        break;

                    case 'CHANNEL_UNBRIDGE':

                        redisClient.decr(callCountInstance);
                        redisClient.decr(callCountCompany);

                        var pubMessage = util.format("EVENT:%s:%s:%s:%s:%s:%s:%s:%s:YYYY", tenantId, companyId, "CALLSERVER", "CALL", "UNBRIDGE", dvpAppId, "", uniqueId);

                        redisClient.publish('events', pubMessage);
                        logger.debug('[DVP-EventMonitor.handler] - [%s] - REDIS DECREMENT');
                        break;

                    case 'HEARTBEAT':

                        var hbData =
                        {
                            FsHostName: event.getHeader('FreeSWITCH-Hostname'),
                            FSInstanceId: switchName,
                            FsIPv4: event.getHeader('FreeSWITCH-IPv4'),
                            UpTime: event.getHeader('Up-Time'),
                            FsVersion: event.getHeader('FreeSWITCH-Version'),
                            UpTimeMSec: event.getHeader('Uptime-msec'),
                            SessionCount: event.getHeader('Session-Count'),
                            MaxSessions: event.getHeader('Max-Sessions'),
                            SessionsPerSec: event.getHeader('Session-Per-Sec'),
                            SessionsPerSecMax: event.getHeader('Session-Per-Sec-Max'),
                            SessionsSinceStartUp: event.getHeader('Session-Since-Startup'),
                            IdleCpu: event.getHeader('Idle-CPU')
                        };

                        if(switchName)
                        {
                            redisClient.set(switchName + '#DVP_CS_INSTANCE_INFO', JSON.stringify(hbData), redisMessageHandler);
                        }

                        break;

                    case 'CHANNEL_DESTROY':

                        var ardsClientUuid = event.getHeader('variable_ards_client_uuid');
                        var ardsCompany = event.getHeader('variable_companyid');
                        var ardsTenant = event.getHeader('variable_tenantid');
                        var ardsServerType = event.getHeader('variable_ards_servertype');
                        var ardsReqType = event.getHeader('variable_ards_requesttype');
                        var ardsResourceId = event.getHeader('variable_ards_resource_id');


                        //Adding call discon record to redis set for cdr summary

                        if(direction === 'inbound'){

                            var utcMoment = moment(eventTime).utc();
                            var year = utcMoment.year();
                            var month = utcMoment.month() + 1;
                            var day = utcMoment.date();
                            var hr = utcMoment.hour();

                            var setName = 'CDRDISCON:' + year + ':' + month + ':' + day + ':' + hr;

                            redisHandler.addToSet(setName, uniqueId, redisMessageHandler);
                        }


                        redisClient.del(uniqueId + '_data', redisMessageHandler);
                        redisClient.del(uniqueId + '_dev', redisMessageHandler);
                        redisClient.del(uniqueId + '_command', redisMessageHandler);

                        var channelSetName = "CHANNELS:" + tenantId + ":" + companyId;

                        if(companyId && tenantId)
                        {
                            redisClient.del('CHANNELMAP:' + uniqueId, redisMessageHandler);

                            var pubMessage = util.format("EVENT:%s:%s:%s:%s:%s:%s:%s:%s:YYYY", tenantId, companyId, "CALLSERVER", "CHANNEL", "DESTROY", dvpAppId, "", uniqueId);

                            redisClient.publish('events', pubMessage);

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
                        var callerContext = event.getHeader('Caller-Context');

                        if(direction === 'outbound' && companyId && tenantId)
                        {
                            var callerOrigIdName = event.getHeader('Caller-Orig-Caller-ID-Name');

                            redisClient.get('SIPUSER_RESOURCE_MAP:' + tenantId + ':' + companyId + ':' + callerOrigIdName, function(err, objString)
                            {
                                var obj = JSON.parse(objString);
                                if(obj && obj.Context && callerContext === obj.Context)
                                {
                                    ardsHandler.SendResourceStatus(reqId, uniqueId, obj.CompanyId, obj.TenantId, '', '', obj.ResourceId, 'Completed', '', '', 'outbound');

                                }

                            })
                        }

                        if(ardsClientUuid)
                        {
                            ardsHandler.SendResourceStatus(reqId, ardsClientUuid, ardsCompany, ardsTenant, ardsServerType, ardsReqType, ardsResourceId, 'Completed', '', '', 'inbound');
                        }



                        redisClient.decr(chanCountInstance);

                        evtData.EventCategory = "CHANNEL_DESTROY";
                        evtData.DisconnectReason = event.getHeader('Hangup-Cause');

                        var jsonStr = JSON.stringify(evtData);
                        if(dvpCustPubId)
                        {
                            redisClient.publish(dvpCustPubId, jsonStr);
                            //logger.debug('[DVP-EventMonitor.handler] - [%s] - REDIS PUBLISH CUSTOM: %s', reqId, jsonStr);
                        }
                        else
                        {
                            redisClient.publish('SYS:MONITORING:DVPEVENTS', jsonStr);
                            //logger.debug('[DVP-EventMonitor.handler] - [%s] - REDIS PUBLISH DVPEVENTS: %s', reqId, jsonStr);
                        }

                        logger.debug('[DVP-EventMonitor.handler] - [%s] - REDIS PUBLISH');

                        var channelSetNameApp = 'CHANNELS_APP:' + dvpAppId;


                        redisClient.srem(channelSetNameApp, uniqueId, redisMessageHandler);
                        redisClient.del(uniqueId, redisMessageHandler);

                        break;

                    case 'PRESENCE_IN':
                        var userUri = event.getHeader('from');
                        var userStatus = event.getHeader('status');
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

                    case 'CUSTOM':

                        if (event.getHeader('Event-Subclass'))
                        {
                            var subClass = event.getHeader('Event-Subclass');
                            if (subClass == 'conference::maintenance')
                            {
                                redisClient.publish(subClass, event.serialize('json'), redisMessageHandler);
                                if (event.getHeader('Action'))
                                {

                                    var action = event.getHeader('Action');

                                    var conferenceName = event.getHeader('Conference-Name');
                                    var conferenceSize = event.getHeader('Conference-Size');
                                    var conferenceID = event.getHeader('Conference-Unique-ID');
                                    var userID = event.getHeader('Member-ID');
                                    var userType = event.getHeader('Member-Type');
                                    var userName = event.getHeader('Caller-Username');
                                    var direction = event.getHeader('Caller-Direction');


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
                                var action = event.getHeader('CC-Action');
                                var agentState = event.getHeader('CC-Agent-State');
                                var agent = event.getHeader('CC-Agent');
                                var agentStatus = event.getHeader('CC-Agent-Status');

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
                                var key = util.format("Park-%s-%s", event.getHeader('Valet-Lot-Name'), event.getHeader('Valet-Extension'));

                                switch (event.getHeader("Action")) {
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
                                var username = event.getHeader('from-user');
                                var realm = event.getHeader('from-host');


                                switch (subClass) {

                                    case 'sofia::register':

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
                                        });


                                        break;

                                    case 'sofia::expire':
                                        redisClient.del('SIPPRESENCE:' + realm + ':' + username, redisMessageHandler);


                                        break;

                                    case 'sofia::unregister':
                                        redisClient.del('SIPPRESENCE:' + realm + ':' + username, redisMessageHandler);


                                        break;

                                }

                            }
                            else if(subClass == 'ards::info')
                            {

                                var action = event.getHeader('ARDS-Action');

                                var ardsClientUuid = event.getHeader('ARDS-Call-UUID');
                                var ardsCompany = event.getHeader('Company');
                                var ardsTenant = event.getHeader('Tenant');
                                var ardsServerType = event.getHeader('ServerType');
                                var ardsReqType = event.getHeader('RequestType');
                                var ardsResourceId = event.getHeader('ARDS-Resource-Id');
                                var reason = event.getHeader('ARDS-Reason');
                                var skill = event.getHeader('ARDS-Call-Skill');

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

                                var jsonStr = JSON.stringify(evtData);

                                redisClient.publish('SYS:MONITORING:DVPEVENTS', jsonStr);

                                if(action === 'agent-rejected')
                                {

                                    ardsHandler.SendResourceStatus(reqId, ardsClientUuid, ardsCompany, ardsTenant, ardsServerType, ardsReqType, ardsResourceId, 'Reject', 'Reject', reason, 'inbound');
                                }
                                else if(action === 'agent-routed')
                                {
                                    var pubMessage = util.format("EVENT:%s:%s:%s:%s:%s:%s:%s:%s:YYYY", ardsTenant, ardsCompany, "ARDS", "AGENT", "ROUTED", "", "", ardsClientUuid);

                                    redisClient.publish('events', pubMessage);

                                }

                            }

                            return;
                        }
                        break;
                    //default:

                }

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

CreateESLWithTimeout();


process.stdin.resume();
