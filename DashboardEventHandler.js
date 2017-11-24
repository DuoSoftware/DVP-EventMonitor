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

        logger.info("Conection with the queue is OK");
    });

    amqpClient.on('error', function (error) {

        logger.info("There is an error" + error);
    });
}
else
{
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

                console.log("No enough sentinel servers found .........");
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


var PublishDashboardMessage = function(tenantId, companyId, eventClass, eventType, eventCategory, sessionId, param1, param2, timestamp)
{
    if(redisClient)
    {
        var pubMessage = util.format("EVENT:%s:%s:%s:%s:%s:%s:%s:%s:YYYY", tenantId, companyId, eventClass, eventType, eventCategory, param1, param2, sessionId);

        redisClient.publish('events', pubMessage);

    }
    else if(amqpClient)
    {
        var sendObj =
        {
            Tenent: tenantId,
            Company: companyId,
            EventClass: eventClass,
            EventType: eventType,
            EventCategory: eventCategory,
            SessionID: sessionId,
            TimeStamp: timestamp,
            Parameter1: param1,
            Parameter2: param2
        };

        queueConnection.publish('DashboardEvents', sendObj, {
            contentType: 'application/json'
        });

    }

};

module.exports.PublishDashboardMessage= PublishDashboardMessage;
