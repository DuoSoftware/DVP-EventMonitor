var redis = require("ioredis");
var Config = require('config');
var logger = require('dvp-common/LogHandler/CommonLogHandler.js').logger;

//var redisIp = Config.Redis.ip;
//var redisPort = Config.Redis.port;
//var password = Config.Redis.password;
//var db = Config.Redis.db;
//
//
//var client = redis.createClient(redisPort, redisIp);
//
//client.auth(password, function (error) {
//    console.log("Redis Auth Error : "+error);
//});
//
//client.select(db, function() {});

////////////////////////////////redis////////////////////////////////////////
var redisip = Config.Redis.ip;
var redisport = Config.Redis.port;
var redispass = Config.Redis.password;
var redismode = Config.Redis.mode;
var redisdb = Config.Redis.db;


//[redis:]//[user][:password@][host][:port][/db-number][?db=db-number[&password=bar[&option=value]]]
//redis://user:secret@localhost:6379
var redisSetting =  {
    port:redisport,
    host:redisip,
    family: 4,
    db: redisdb,
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

    if(Config.Redis.sentinels && Config.Redis.sentinels.hosts && Config.Redis.sentinels.port && Config.Redis.sentinels.name){
        var sentinelHosts = Config.Redis.sentinels.hosts.split(',');
        if(Array.isArray(sentinelHosts) && sentinelHosts.length > 2){
            var sentinelConnections = [];

            sentinelHosts.forEach(function(item){

                sentinelConnections.push({host: item, port:Config.Redis.sentinels.port})

            })

            redisSetting = {
                sentinels:sentinelConnections,
                name: Config.Redis.sentinels.name,
                password: redispass
            }

        }else{

            console.log("No enough sentinel servers found .........");
        }

    }
}

var client = undefined;

if(redismode != "cluster") {
    client = new redis(redisSetting);
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

        var client = new redis.Cluster([redisSetting]);

    }else{

        client = new redis(redisSetting);
    }
}


var addToSet = function(setName, value, callback){

    try{

        client.sadd(setName, value, function(err, response){

            if(err){

                logger.error('[DVP-EventMonitor.RedisHandler.SetObject] - REDIS ERROR', err)
            }
            callback(err, response);
        });

    }
    catch(ex){

        callback(ex, undefined);
    }

};

client.on('error', function(msg){

});

module.exports.addToSet = addToSet;
