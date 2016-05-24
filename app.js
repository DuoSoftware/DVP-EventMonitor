var esl = require('modesl');
var redis = require('redis');
var querystring = require('querystring');
var http = require('http');
var config = require('config');
var colors = require('colors');
var util = require('util');
var request = require('request');
var amqp = require('amqp');
var os = require('os');
var nodeUuid = require('node-uuid');
var logger = require('dvp-common/LogHandler/CommonLogHandler.js').logger;
var extApiAccess = require('./ExternalApiAccess.js');
var tcpp = require('tcp-ping');
var moment = require('moment');
var dbOp = require('./DbOperationsHandler.js');
var ardsHandler = require('./ArdsResourceStateHandler.js');



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
                var variableEvtTime = event.getHeader("variable_Event-Date-Timestamp");
                var switchName = event.getHeader('FreeSWITCH-Switchname');
                var chanCountInstance = 'DVP_CHANNEL_COUNT_INSTANCE:' + switchName;
                var callCountInstance = 'DVP_CALL_COUNT_INSTANCE:' + switchName;
                var callCountCompany = 'DVP_CALL_COUNT_COMPANY:' + tenantId + ':' + companyId;
                var chanCountCompany = 'DVP_CHANNEL_COUNT_COMPANY:' + tenantId + ':' + companyId;
                var callerDestNum = event.getHeader('Caller-Destination-Number');
                var ardsAction = event.getHeader('ARDS-Action');
                var ardsClientUuid = event.getHeader('ards_client_uuid');
                var dvpAppId = event.getHeader('variable_dvp_app_id');
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
                    EventParams: event,
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

                        var otherleg = event.getHeader('Other-Leg-Unique-ID');

                        redisClient.hset(uniqueId, 'Bridge-State', 'Bridged', redisMessageHandler);
                        redisClient.hset(uniqueId, 'Other-Leg-Unique-ID', otherleg, redisMessageHandler);
                        break;

                    case 'CHANNEL_CALLSTATE':
                    {
                        var otherleg;
                        var calltype;
                        if (event.getHeader('Other-Leg-Unique-ID'))
                        {
                            redisClient.hset(uniqueId, 'Other-Leg-Unique-ID', event.getHeader('Other-Leg-Unique-ID'), redisMessageHandler);
                            otherleg = event.getHeader('Other-Leg-Unique-ID');
                            calltype = "NORMAL";
                        }

                        if (event.getHeader('variable_fifo_bridge_uuid'))
                        {

                            redisClient.hset(uniqueId, 'Other-Leg-Unique-ID', event.getHeader('variable_fifo_bridge_uuid'), redisMessageHandler);
                            otherleg = event.getHeader('variable_fifo_bridge_uuid');
                            calltype = 'FIFO';
                            redisClient.hset(uniqueId, 'Call-Type', calltype, redisMessageHandler);
                        }


                    }
                        //redisClient.hset(uniqueId, 'data', event.serialize('json'), redisMessageHandler);
                        redisClient.hset(uniqueId, 'Channel-Call-State', event.getHeader('Channel-Call-State'), redisMessageHandler);

                        break;

                    case 'CHANNEL_CREATE':

                        var channelState = event.getHeader('Channel-State');
                        var channelName = event.getHeader('Channel-Name');
                        var direction = event.getHeader('Call-Direction');
                        var callerUniqueId = event.getHeader('Caller-Unique-ID');
                        var otherLegUuid = event.getHeader('Other-Leg-Unique-ID');
                        var fifoBridgeUuid = event.getHeader('variable_fifo_bridge_uuid');
                        var channelPresId = event.getHeader('Channel-Presence-ID');
                        var channelCallState = event.getHeader('Channel-Call-State');
                        var sipGatewayName = event.getHeader("variable_sip_gateway_name");
                        var variableLoopbackApp = event.getHeader("variable_loopback_app");
                        var variableSipAuthRealm = event.getHeader("variable_sip_auth_realm");

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
                            redisClient.hset(uniqueId, 'Channel-State', channelState, redisMessageHandler);
                            redisClient.hset(uniqueId, 'FreeSWITCH-Switchname', switchName, redisMessageHandler);
                            redisClient.hset(uniqueId, 'Channel-Name', channelName, redisMessageHandler);
                            redisClient.hset(uniqueId, 'Call-Direction', direction, redisMessageHandler);
                            redisClient.hset(uniqueId, 'Caller-Destination-Number', callerDestNum, redisMessageHandler);
                            redisClient.hset(uniqueId, 'Caller-Unique-ID', callerUniqueId, redisMessageHandler);
                            redisClient.hset(uniqueId, 'variable_sip_auth_realm', variableSipAuthRealm, redisMessageHandler);
                            redisClient.hset(uniqueId, 'variable_dvp_app_id', dvpAppId, redisMessageHandler);

                            var otherleg = 'none';

                            if (otherLegUuid)
                            {
                                redisClient.hset(uniqueId, 'Other-Leg-Unique-ID', otherLegUuid, redisMessageHandler);
                                otherleg = otherLegUuid;
                                calltype = "NORMAL";
                            }

                            if (fifoBridgeUuid)
                            {
                                redisClient.hset(uniqueId, 'Other-Leg-Unique-ID', fifoBridgeUuid, redisMessageHandler);
                                otherleg = fifoBridgeUuid;
                                calltype = 'FIFO';
                                redisClient.hset(uniqueId, 'Call-Type', calltype, redisMessageHandler);
                            }


                            //redisClient.hset(uniqueId, 'data', event.serialize('json'), redisMessageHandler);

                        }

                        break;
                    case 'CHANNEL_STATE':
                        if (event.getHeader('Channel-State') != 'CS_DESTROY')
                        {
                            logger.debug('[DVP-EventMonitor.handler] - [%s] - REDIS GET');
                            if (redisClient.exists(uniqueId))
                            {
                                redisClient.hset(uniqueId, 'Channel-State', event.getHeader('Channel-State'), redisMessageHandler);
                            }
                        }
                        else
                        {
                            redisClient.del(uniqueId, redisMessageHandler);
                        }
                        break;
                    case 'CHANNEL_ANSWER':

                        var ardsClientUuid = event.getHeader('variable_ards_client_uuid');
                        var ardsCompany = event.getHeader('variable_companyid');
                        var ardsTenant = event.getHeader('variable_tenantid');
                        var ardsServerType = event.getHeader('variable_ards_servertype');
                        var ardsReqType = event.getHeader('variable_ards_requesttype');
                        var ardsResourceId = event.getHeader('variable_ards_resource_id');

                        ardsHandler.SendResourceStatus(reqId, ardsClientUuid, ardsCompany, ardsTenant, ardsServerType, ardsReqType, ardsResourceId, 'Connected', '', '');

                        evtData.EventCategory = "CHANNEL_ANSWER";

                        var jsonStr = JSON.stringify(evtData);
                        logger.debug('[DVP-EventMonitor.handler] - [%s] - REDIS PUBLISH');
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

                        redisClient.del(uniqueId + '_data', redisMessageHandler);
                        redisClient.del(uniqueId + '_dev', redisMessageHandler);
                        redisClient.del(uniqueId + '_command', redisMessageHandler);

                        var channelSetName = "CHANNELS:" + tenantId + ":" + companyId;

                        if(companyId && tenantId)
                        {
                            redisClient.srem(channelSetName, uniqueId, redisMessageHandler);
                            redisClient.del('CHANNELMAP:' + uniqueId, redisMessageHandler);

                            var pubMessage = util.format("EVENT:%s:%s:%s:%s:%s:%s:%s:%s:YYYY", tenantId, companyId, "CALLSERVER", "CHANNEL", "DESTROY", dvpAppId, "", uniqueId);

                            redisClient.publish('events', pubMessage);

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

                        ardsHandler.SendResourceStatus(reqId, ardsClientUuid, ardsCompany, ardsTenant, ardsServerType, ardsReqType, ardsResourceId, 'Completed', '', '');

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
                                if (event.getHeader('Action')) {

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
                                            //redisClient.lpush("Conference-List", conferenceID, redisMessageHandler);
                                            //redisClient.set('ConferenceNameMap_' + conferenceName, conferenceID, redisMessageHandler);
                                            //redisClient.hset(conferenceID, 'Conference-Unique-ID', conferenceID, redisMessageHandler);
                                            //redisClient.hset(conferenceID, 'Conference-Name', conferenceName, redisMessageHandler);
                                            //redisClient.hset(conferenceID, 'SwitchName', switchName, redisMessageHandler);
                                            //redisClient.hset(conferenceID, 'Data', event.serialize('json'), redisMessageHandler);
                                            break;
                                        case 'conference-destroy':
                                            results.event = 'destroy';

                                            redisClient.del('CONFERENCE-COUNT:' + conferenceName, redisMessageHandler);
                                            redisClient.del('CONFERENCE-MEMBERS:' + conferenceName, userName, redisMessageHandler);

                                            break;
                                        case 'add-member':

                                            //--------------

                                            redisClient.incr('CONFERENCE-COUNT:' + conferenceName, redisMessageHandler);
                                            redisClient.sadd('CONFERENCE-MEMBERS:' + conferenceName, userName,  redisMessageHandler);


                                            //------------
                                            redisClient.hset("CONFERENCE-USER:" + userName, 'Caller-Username', userName, redisMessageHandler);
                                            redisClient.hset("CONFERENCE-USER:" + userName, 'Member-Type', userType, redisMessageHandler);
                                            redisClient.hset("CONFERENCE-USER:" + userName, 'Member-State', 'ADDED', redisMessageHandler);
                                            redisClient.hset("CONFERENCE-USER:" + userName, 'Caller-Direction', direction, redisMessageHandler);
                                            redisClient.hset("CONFERENCE-USER:" + userName, 'Conference-Unique-ID', conferenceID, redisMessageHandler);


                                            break;
                                        case 'del-member':

                                            redisClient.decr('CONFERENCE-COUNT:' + conferenceName, redisMessageHandler);
                                            redisClient.srem('CONFERENCE-MEMBERS:' + conferenceName, userName,  redisMessageHandler);

                                            redisClient.del('CONFERENCE-USER:' + userName, redisMessageHandler);

                                            break;
                                        case 'start-talking':

                                            redisClient.hset("CONFERENCE-USER:" + userName, 'Member-State', 'TALKING', redisMessageHandler);

                                            break;
                                        case 'stop-talking':
                                            redisClient.hset("CONFERENCE-USER:" + userName, 'Member-State', 'LISTENING', redisMessageHandler);
                                            break;
                                        case 'bgdial-result':

                                            break;

                                    }
                                    //httpPOST('ConferenceStatus', results);
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
                                        var presObj = {
                                            SipUsername: username,
                                            Domain: realm,
                                            Status: 'REGISTERED'
                                        };

                                        redisClient.set('SIPPRESENCE:' + realm + ':' + username, JSON.stringify(presObj), redisMessageHandler);


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

                                if(action === 'agent-rejected')
                                {
                                    var ardsServerType = event.getHeader('ServerType');
                                    var ardsReqType = event.getHeader('RequestType');
                                    var ardsResourceId = event.getHeader('ARDS-Resource-Id');
                                    var reason = event.getHeader('ARDS-Reason');

                                    ardsHandler.SendResourceStatus(reqId, ardsClientUuid, ardsCompany, ardsTenant, ardsServerType, ardsReqType, ardsResourceId, 'Reject', 'Reject', reason);
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
