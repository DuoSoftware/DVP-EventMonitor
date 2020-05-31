var redis = require("ioredis");
var format = require('stringformat');
var amqp = require('amqp');
var config = require('config');
var logger = require('dvp-common-lite/LogHandler/CommonLogHandler.js').logger;

var redisClient = null;
var amqpClient = null;

if(config.EventPublishMethod === 'amqp')
{
    //Create AMQP Connection
    console.log('=================== CREATING AMQP EVENT CONNECTION ====================');
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

        logger.info("EVENT - AMQP CONNECTION READY");
    });

    amqpClient.on('error', function (error) {

        logger.info("EVENT - AMQP CONNECTION - ERROR : " + error);
    });
}
else
{
    console.log('=================== CREATING REDIS EVENT CONNECTION ====================');
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

                console.log("No enough sentinel servers found - EVENT REDIS");
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


var PublishDVPEventsMessage = function(obj)
{
    if(redisClient)
    {
        var msg = JSON.stringify(obj);
        redisClient.publish('SYS:MONITORING:DVPEVENTS', msg);

        logger.debug("DVP EVENTS PUBLISH : MESSAGE : " + msg);

    }
    else if(amqpClient)
    {
        try
        {
            amqpClient.publish('DVPEVENTS', obj, {
                contentType: 'application/json'
            });

            logger.debug("DASHBOARD PUBLISH : MESSAGE : " + JSON.stringify(obj));
        }
        catch(ex)
        {
            logger.error('Error sending message : ', ex);

        }

    }

};

module.exports.PublishDVPEventsMessage= PublishDVPEventsMessage;