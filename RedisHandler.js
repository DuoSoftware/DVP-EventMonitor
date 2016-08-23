var redis = require("redis");
var Config = require('config');
var logger = require('dvp-common/LogHandler/CommonLogHandler.js').logger;

var redisIp = Config.Redis.ip;
var redisPort = Config.Redis.port;
var password = Config.Redis.password;
var db = Config.Redis.db;


var client = redis.createClient(redisPort, redisIp);

client.auth(password, function (error) {
    console.log("Redis Auth Error : "+error);
});

client.select(db, function() {});

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