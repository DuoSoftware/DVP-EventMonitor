var redis = require("ioredis");
var format = require('stringformat');
var amqp = require('amqp');
var config = require('config');
var logger = require('dvp-common/LogHandler/CommonLogHandler.js').logger;

var redisClient = null;
var amqpClient = null;

if(config.UseDashboardAMQP && config.UseDashboardAMQP == 'true')
{
    //Create AMQP Connection
    console.log('=================== CREATING AMQP DASHBOARD CONNECTION ====================');
    var ips = [];
    if(config.RabbitMQ.ip) {
        ips = config.RabbitMQ.ip.split(",");
    }


    amqpClient = amqp.createConnection({
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

    amqpClient.on('ready', function () {

        logger.info("DASHBOARD - AMQP CONNECTION READY");
    });

    amqpClient.on('error', function (error) {

        logger.info("DASHBOARD - AMQP CONNECTION - ERROR : " + error);
    });
}
else
{
    console.log('=================== CREATING REDIS DASHBOARD CONNECTION ====================');
    var redisip = config.Redis.ip;
    var redisport = config.Redis.port;
    var redispass = config.Redis.password;
    var redismode = config.Redis.mode;

    var redisSetting =  {
        port:redisport,
        host:redisip,
        family: 4,
        db: 0,
        password: redispass,
        retryStrategy: function (times) {
            return Math.min(times * 50, 2000);
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

                });

                redisSetting = {
                    sentinels:sentinelConnections,
                    name: config.Redis.sentinels.name,
                    password: redispass
                }

            }else{

                console.log("No enough sentinel servers found - DASHBOARD REDIS");
            }

        }
    }

    if(redismode != "cluster")
    {
        redisClient = new redis(redisSetting);
    }
    else
    {

        var redisHosts = redisip.split(",");
        if(Array.isArray(redisHosts))
        {
            redisSetting = [];
            redisHosts.forEach(function(item){
                redisSetting.push({
                    host: item,
                    port: redisport,
                    family: 4,
                    password: redispass});
            });

            redisClient = new redis.Cluster([redisSetting]);

        }
        else
        {
            redisClient = new redis(redisSetting);
        }
    }


    redisClient.on('error', function(msg){

    });
}


var PublishDashboardMessage = function(tenantId, companyId, bUnit, eventClass, eventType, eventCategory, sessionId, param1, param2, timestamp)
{
    var tempBUnit = bUnit;

    if(!bUnit)
    {
        tempBUnit = 'default';
    }

    if(redisClient)
    {
        var pubMessage = util.format("EVENT:%s:%s:%s:%s:%s:%s:%s:%s:%s:YYYY", tenantId, companyId, tempBUnit, eventClass, eventType, eventCategory, param1, param2, sessionId);

        redisClient.publish('events', pubMessage);

        logger.debug("DASHBOARD PUBLISH : MESSAGE : " + pubMessage);

    }
    else if(amqpClient)
    {
        var tenantInt = 0;
        var companyInt = 0;

        try
        {
            tenantInt = parseInt(tenantId);
            companyInt = parseInt(companyId);

            var sendObj =
            {
                Tenant: tenantInt,
                Company: companyInt,
                EventClass: eventClass,
                EventType: eventType,
                EventCategory: eventCategory,
                SessionID: sessionId,
                TimeStamp: timestamp,
                Parameter1: param1,
                Parameter2: param2,
                BusinessUnit: bUnit
            };

            amqpClient.publish('DashboardEvents', sendObj, {
                contentType: 'application/json'
            });

            logger.debug("DASHBOARD PUBLISH : MESSAGE : " + JSON.stringify(sendObj));
        }
        catch(ex)
        {
            logger.error('Error sending message : ', ex);

        }


    }

};

module.exports.PublishDashboardMessage= PublishDashboardMessage;
