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


//open a connection
var redisPort = config.Redis.port;
var redisIp = config.Redis.ip;
var freeswitchIp = config.Freeswitch.ip;
var fsPort = config.Freeswitch.port;
var fsPassword = config.Freeswitch.password;
var fsHttpPort = config.Freeswitch.httport;

////////////////////////////redis/////////////////////////////////////////////////////
var redisClient = redis.createClient(redisPort,redisIp);

redisClient.on('error',function(err){
    console.log('Error '.red, err);
    });
//////////////////////////////////////////////////////////////////////////////////////

    var httpPOST = function (section, data) {

        //http://192.168.0.60/CSRequestWebApi/api/
        var post_domain = config.WebAPI.domain;
        var post_port = config.WebAPI.port;
        var post_path = config.WebAPI.path + section;


        var post_data = JSON.stringify(data);
        var post_options = {
            host: post_domain,
            port: post_port,
            path: post_path,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': post_data.length
            }
        };

        var post_req = http.request(post_options, function (res) {
            res.setEncoding('utf8');
            res.on('data', function (chunk) {
                console.log('Response: ' + chunk);
            });
        }).on("error", function (e) {
            console.log("Got error: " + e.message);
        });

        // write parameters to post body
        post_req.write(post_data);
        post_req.end();


    };

    var handler = function (event, header, body) {

        try
        {
        if (header)
        {
            console.log("EVENT_TYPE : " + event.type + ", CHANNEL_STATE : " + event.getHeader('Channel-State') + ', SESSION_ID : ' + event.getHeader('Unique-ID') + ', CALLER_UUID : ' + event.getHeader('Caller-Unique-ID') + 'SWITCH NAME : ' + event.getHeader('FreeSWITCH-Switchname'));

            var evtType = event.type;
            var sessionId = event.getHeader('Unique-ID');
            var variableEvtTime = event.getHeader("variable_Event-Date-Timestamp");
            var eventTime = new Date();
            var switchName = event.getHeader('FreeSWITCH-Switchname');
            var chanCount = switchName + '#DVP_CHANNEL_COUNT';
            var callCount = switchName + '#DVP_CALL_COUNT';

            if(variableEvtTime)
            {
                var varEvtTime = parseInt(variableEvtTime)/1000;
                eventTime = new Date(varEvtTime);
            }

            var evtData =
            {
                SessionId: sessionId,
                EventClass: "CALL",
                EventType : "CHANNEL",
                EventTime : eventTime,
                EventName : evtType,
                EventData : sessionId,
                EventParams : event
            };

            switch (event.type)
            {
                case 'CHANNEL_BRIDGE':

                    redisClient.incr(callCount);

                    evtData.EventCategory = "CHANNEL_BRIDGE";

                    var jsonStr = JSON.stringify(evtData);
                    redisClient.publish('DVPEVENTS', jsonStr);

                    redisClient.hset(event.getHeader('Unique-ID'), 'Bridge-State', 'Bridged', redis.print);
                    break;

                case 'CHANNEL_CALLSTATE':
                    {
                        var otherleg;
                        var calltype;
                        if (event.getHeader('Other-Leg-Unique-ID'))
                        {
                            redisClient.hset(event.getHeader('Unique-ID'), 'Other-Leg-Unique-ID', event.getHeader('Other-Leg-Unique-ID'), redis.print);
                            otherleg = event.getHeader('Other-Leg-Unique-ID');
                            calltype = "NORMAL";
                        }

                        if (event.getHeader('variable_fifo_bridge_uuid'))
                        {

                            redisClient.hset(event.getHeader('Unique-ID'), 'Other-Leg-Unique-ID', event.getHeader('variable_fifo_bridge_uuid'), redis.print);
                            otherleg = event.getHeader('variable_fifo_bridge_uuid');
                            calltype = 'FIFO';
                            redisClient.hset(event.getHeader('Unique-ID'), 'Call-Type', calltype, redis.print);
                        }

                        //var postData = { channel: event.getHeader('Channel-Name'), direction: event.getHeader('Call-Direction'), presence: event.getHeader('Channel-Presence-ID'), callstate: event.getHeader('Channel-Call-State'), uuid: event.getHeader('Unique-ID'), otheruuid: otherleg, type: calltype };
                        //httpPOST('ChannelState', postData);
                    }
                    redisClient.hset(event.getHeader('Unique-ID'), 'data', event.serialize('json'), redis.print);
                    redisClient.hset(event.getHeader('Unique-ID'), 'Channel-Call-State', event.getHeader('Channel-Call-State'), redis.print);

                    break;

                case 'CHANNEL_CREATE':

                    var uniqueId = event.getHeader('Unique-ID');
                    var channelState = event.getHeader('Channel-State');
                    var channelName = event.getHeader('Channel-Name');
                    var direction = event.getHeader('Call-Direction');
                    var callerDestNum = event.getHeader('Caller-Destination-Number');
                    var callerUniqueId = event.getHeader('Caller-Unique-ID');
                    var otherLegUuid = event.getHeader('Other-Leg-Unique-ID');
                    var fifoBridgeUuid = event.getHeader('variable_fifo_bridge_uuid');
                    var channelPresId = event.getHeader('Channel-Presence-ID');
                    var channelCallState = event.getHeader('Channel-Call-State');
                    var sipGatewayName = event.getHeader("variable_sip_gateway_name");
                    var variableLoopbackApp = event.getHeader("variable_loopback_app");
                    var variableSipAuthRealm = event.getHeader("variable_sip_auth_realm");

                    redisClient.incr(chanCount);

                    evtData.EventCategory = "CHANNEL_CREATE";

                    var jsonStr = JSON.stringify(evtData);
                    redisClient.publish('SYS:MONITORING:DVPEVENTS', jsonStr);

                    var channelSetName = "CHANNEL@" + variableSipAuthRealm;

                    if(!variableLoopbackApp)
                    {
                        if(variableSipAuthRealm)
                        {
                            redisClient.sismember(channelSetName, uniqueId, function (err, reply)
                            {
                                if(reply === 0)
                                {
                                    redisClient.sadd(channelSetName, uniqueId, redis.print);
                                }
                            });
                        }
                        else
                        {
                            //get hash from first
                            redisClient.hget(otherLegUuid, 'variable_sip_auth_realm', function(err, val)
                            {
                                if(!err && val)
                                {
                                    var newChannelSetName = "CHANNEL@" + val;
                                    redisClient.sismember(newChannelSetName, uniqueId, function (err, reply)
                                    {
                                        if(reply === 0)
                                        {
                                            redisClient.sadd(newChannelSetName, uniqueId, redis.print);
                                        }
                                    });
                                }

                            })
                        }

                        redisClient.hset(uniqueId, 'Channel-State', channelState, redis.print);
                        redisClient.hset(uniqueId, 'FreeSWITCH-Switchname', switchName, redis.print);
                        redisClient.hset(uniqueId, 'Channel-Name', channelName, redis.print);
                        redisClient.hset(uniqueId, 'Call-Direction', direction, redis.print);
                        redisClient.hset(uniqueId, 'Caller-Destination-Number', callerDestNum, redis.print);
                        redisClient.hset(uniqueId, 'Caller-Unique-ID', callerUniqueId, redis.print);
                        redisClient.hset(uniqueId, 'variable_sip_auth_realm', variableSipAuthRealm, redis.print);

                        var otherleg = 'none';

                        if (otherLegUuid)
                        {
                            redisClient.hset(uniqueId, 'Other-Leg-Unique-ID', otherLegUuid, redis.print);
                            otherleg = otherLegUuid;
                            calltype = "NORMAL";
                        }

                        if (fifoBridgeUuid)
                        {
                            redisClient.hset(uniqueId, 'Other-Leg-Unique-ID', fifoBridgeUuid, redis.print);
                            otherleg = fifoBridgeUuid;
                            calltype = 'FIFO';
                            redisClient.hset(uniqueId, 'Call-Type', calltype, redis.print);
                        }



                        redisClient.hset(uniqueId, 'data', event.serialize('json'), redis.print);

                    }

                        break;
                    case 'CHANNEL_STATE':

                        if (event.getHeader('Channel-State') != 'CS_DESTROY')
                        {
                            if (redisClient.exists(event.getHeader('Unique-ID')))
                            {
                                redisClient.hset(event.getHeader('Unique-ID'), 'Channel-State', event.getHeader('Channel-State'), redis.print);
                            }
                        }
                        else
                        {
                            redisClient.del(event.getHeader('Unique-ID'), redis.print);
                        }
                        break;
                case 'CHANNEL_ANSWER':

                    evtData.EventCategory = "CHANNEL_ANSWER";

                    var jsonStr = JSON.stringify(evtData);
                    redisClient.publish('DVPEVENTS', jsonStr);

                    break;

                case 'CHANNEL_UNBRIDGE':

                    redisClient.decr(callCount);
                    break;

                case 'HEARTBEAT':

                    console.log(event);

                    var hbData =
                    {
                        FsHostName: event.getHeader('FreeSWITCH-Hostname'),
                        FSInstanceId: switchName,
                        FsIPv4 : event.getHeader('FreeSWITCH-IPv4'),
                        UpTime : event.getHeader('Up-Time'),
                        FsVersion : event.getHeader('FreeSWITCH-Version'),
                        UpTimeMSec : event.getHeader('Uptime-msec'),
                        SessionCount : event.getHeader('Session-Count'),
                        MaxSessions : event.getHeader('Max-Sessions'),
                        SessionsPerSec : event.getHeader('Session-Per-Sec'),
                        SessionsPerSecMax : event.getHeader('Session-Per-Sec-Max'),
                        SessionsSinceStartUp : event.getHeader('Session-Since-Startup'),
                        IdleCpu : event.getHeader('Idle-CPU')
                    };

                    redisClient.set(FSInstanceId + '#DVP_CS_INSTANCE_INFO', JSON.stringify(hbData));

                    break;

                case 'CHANNEL_DESTROY':

                    redisClient.decr(chanCount);

                    var jsonStr = JSON.stringify(evtData);
                    redisClient.publish('DVPEVENTS', jsonStr);

                    var uniqueId = event.getHeader('Unique-ID');
                    var variableSipAuthRealm = event.getHeader("variable_sip_auth_realm");

                    var channelSetName = "CHANNEL@" + variableSipAuthRealm;

                    redisClient.del(channelSetName, redis.print);
                    redisClient.del(uniqueId, redis.print);

                    break;

                    case 'CUSTOM':
                        if (event.getHeader('Event-Subclass'))
                        {
                            var subClass = event.getHeader('Event-Subclass');
                            if (subClass == 'conference::maintenance')
                            {
                                redisClient.publish(subClass, event.serialize('json'), redis.print);
                                if (event.getHeader('Action'))
                                {

                                    var action = event.getHeader('Action');

                                    //console.log(subClass);
                                    //console.log(action);
                                    var conferenceName = event.getHeader('Conference-Name');
                                    var conferenceSize = event.getHeader('Conference-Size');
                                    var conferenceID = event.getHeader('Conference-Unique-ID');
                                    var userID = event.getHeader('Member-ID');
                                    var userType = event.getHeader('Member-Type');
                                    var userName = event.getHeader('Caller-Username');
                                    var direction = event.getHeader('Caller-Direction');
                                    var resultx = event.getHeader('Result');

                                    var results = { ID: conferenceID, name: conferenceName, size: conferenceSize, eventAction: action };

                                    switch (action)
                                    {
                                        case 'conference-create':
                                            results.event = 'create';
                                            redisClient.lpush("Conference-List", conferenceID, redis.print);
                                            redisClient.set('ConferenceNameMap_' + conferenceName, conferenceID, redis.print);
                                            redisClient.hset(conferenceID, 'Conference-Unique-ID', conferenceID, redis.print);
                                            redisClient.hset(conferenceID, 'Conference-Name', conferenceName, redis.print);
                                            redisClient.hset(conferenceID, 'Data', event.serialize('json'), redis.print);
                                            break;
                                        case 'conference-destroy':
                                            results.event = 'destroy';
                                            redisClient.lrem("Conference-List", 0, conferenceID, redis.print);
                                            redisClient.del(conferenceID, redis.print);
                                            redisClient.del("Conference-Member-List-" + conferenceID, redis.print);
                                            redisClient.del('ConferenceNameMap_' + conferenceName, redis.print);
                                            break;
                                        case 'add-member':
                                            results.event = 'add';
                                            results.userID = userID;
                                            results.userName = userName;
                                            results.direction = direction;
                                            results.userType = userType;
                                            redisClient.hset("Conference-User-" + conferenceID + "-" + userName, 'Caller-Username', userName, redis.print);
                                            redisClient.hset("Conference-User-" + conferenceID + "-" + userName, 'Member-Type', userType, redis.print);
                                            redisClient.hset("Conference-User-" + conferenceID + "-" + userName, 'Member-State', 'ADDED', redis.print);
                                            //redisClient.hset(conferenceID, userName, 'listen', redis.print);
                                            redisClient.sadd("Conference-Member-List-" + conferenceID, userName, redis.print);
                                            break;
                                        case 'del-member':
                                            results.event = 'delete';
                                            results.userID = userID;
                                            results.userName = userName;
                                            results.direction = direction;
                                            results.userType = userType;
                                            redisClient.hdel("Conference-User-" + conferenceID + "-" + userName, redis.print);
                                            redisClient.srem("Conference-Member-List-" + conferenceID, userName, redis.print);
                                            break;
                                        case 'start-talking':
                                            results.event = 'talking';
                                            results.userID = userID;
                                            results.userName = userName;
                                            results.direction = direction;
                                            results.userType = userType;
                                            redisClient.hset("Conference-User-" + conferenceID + "-" + userName, 'Member-State', 'TALKING', redis.print);
                                            //redisClient.hset(conferenceID, userName, 'talking', redis.print);
                                            break;
                                        case 'stop-talking':
                                            results.event = 'stoptalking';
                                            results.userID = userID;
                                            results.userName = userName;
                                            results.direction = direction;
                                            results.userType = userType;
                                            redisClient.hset("Conference-User-" + conferenceID + "-" + userName, 'Member-State', 'LISTENING', redis.print);
                                            //redisClient.hset(conferenceID, userName, 'listen', redis.print);
                                            break;
                                        case 'bgdial-result':
                                            results.event = 'bgdial';
                                            results.result = resultx;
                                            break;

                                    }
                                    //httpPOST('ConferenceStatus', results);
                                }


                            }

                            else if (subClass.indexOf('valet_parking::') > -1)
                            {

                                redisClient.publish(subClass, event.serialize('json'), redis.print);

                                //console.log(event.getHeader("Action"));
                                var key = util.format("Park-%s-%s", event.getHeader('Valet-Lot-Name'), event.getHeader('Valet-Extension'));

                                switch (event.getHeader("Action")) {
                                    case "hold":
                                        redisClient.set(key, event.serialize('json'), redis.print);
                                        break;

                                    case "bridge":
                                        break;

                                    case "exit":
                                        redisClient.del(key, redis.print);
                                        break;
                                }


                            }
                            else if (subClass.indexOf('spandsp::') > -1)
                            {

                                switch (subClass) {
                                    case 'spandsp::txfaxresult':

                                        //console.log(event.getHeader("fax-result-text"));

                                        break;

                                    case 'spandsp::rxfaxresult':

                                        //console.log(event.getHeader("fax-result-text"));

                                        break;

                                }
                            }
                            else if (subClass.indexOf('sofia::') > -1)
                            {

                                //redisClient.publish(subClass, event.serialize('json'), redis.print);
                                var username = event.getHeader('username');
                                var realm = event.getHeader('realm');
                                var profileName = event.getHeader('profile-name');
                                var regDetails = { name: username, realm: realm, profile: profileName, status: "None" };

                                var setName = "SIPREG@" + realm;
                                var sipuser = "SIPUSER:" + username + "@" + realm;

                                switch (subClass)
                                {

                                    case 'sofia::register':

                                        regDetails.status = "REGISTERED";

                                        redisClient.sismember(setName, sipuser, function (err, reply)
                                            {
                                                if(reply === 0)
                                                {
                                                    redisClient.sadd(setName, sipuser, redis.print);
                                                }
                                            });

                                        var evtDataJson = event.serialize('json');

                                        redisClient.hset(sipuser, 'username', username, redis.print);
                                        redisClient.hset(sipuser, 'RegisterState', 'REGISTERED', redis.print);
                                        redisClient.hset(sipuser, 'Data', evtDataJson, redis.print);

                                        //console.log(regDetails.status + " - " + sipuser);

                                        //http://localhost:8080/api/fifo_member? add myq user/1000@realm

                                        break;

                                    case 'sofia::expire':
                                        regDetails.status = "OFFLINE";
                                        redisClient.hset(sipuser, 'RegisterState', 'OFFLINE', redis.print);

                                        //console.log(regDetails.status + " - " + sipuser);

                                        break;

                                    case 'sofia::unregister':

                                        redisClient.srem(setName, 0, sipuser, redis.print);
                                        redisClient.del(sipuser, redis.print);

                                        //console.log(regDetails.status + " - " + sipuser);

                                        break;

                                }

                                //console.log(subClass.yellow);

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
            console.log(e);

        }

    };


var conn = new esl.Connection(freeswitchIp, fsPort, fsPassword, function()
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
            'spandsp::rxfaxresult']*/['all'], function (){

                conn.on('esl::event::**',handler);
                console.log('Subscribed ...... '.green);
                });
    });

process.stdin.resume();
