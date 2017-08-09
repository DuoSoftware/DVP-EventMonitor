/**
 * Created by dinusha on 6/12/2017.
 */
var mongoose = require('mongoose');
var config = require('config');
var util = require('util');

var mongoip=config.Mongo.ip;
var mongoport=config.Mongo.port;
var mongodb=config.Mongo.dbname;
var mongouser=config.Mongo.user;
var mongopass = config.Mongo.password;
var mongoreplicaset= config.Mongo.replicaset;

var connectionstring = '';

mongoip = mongoip.split(',');

var User = require('dvp-mongomodels/model/User');

if(util.isArray(mongoip)){

    if(mongoip.length > 1){

        mongoip.forEach(function(item){
            connectionstring += util.format('%s:%d,',item,mongoport)
        });

        connectionstring = connectionstring.substring(0, connectionstring.length - 1);
        connectionstring = util.format('mongodb://%s:%s@%s/%s',mongouser,mongopass,connectionstring,mongodb);

        if(mongoreplicaset){
            connectionstring = util.format('%s?replicaSet=%s',connectionstring,mongoreplicaset) ;
        }
    }else{

        connectionstring = util.format('mongodb://%s:%s@%s:%d/%s',mongouser,mongopass,mongoip[0],mongoport,mongodb)
    }

}else{

    connectionstring = util.format('mongodb://%s:%s@%s:%d/%s',mongouser,mongopass,mongoip,mongoport,mongodb)
}


mongoose.connect(connectionstring,{server:{auto_reconnect:true}});


mongoose.connection.on('error', function (err) {
    console.error( new Error(err));
    mongoose.disconnect();

});

mongoose.connection.on('opening', function() {
    console.log("reconnecting... %d", mongoose.connection.readyState);
});


mongoose.connection.on('disconnected', function() {
    console.error( new Error('Could not connect to database'));
    mongoose.connect(connectionstring,{server:{auto_reconnect:true}});
});

mongoose.connection.once('open', function() {
    console.log("Connected to db");

});


mongoose.connection.on('reconnected', function () {
    console.log('MongoDB reconnected!');
});



process.on('SIGINT', function() {
    mongoose.connection.close(function () {
        console.log('Mongoose default connection disconnected through app termination');
        process.exit(0);
    });
});


var getUserData = function(id, callback)
{
    User.findOne({_id: id}).exec(function (err, user)
    {
        callback(err, user);
    });
};

var getSuperUsers = function(callback)
{
    User.find({'user_meta.role': "superadmin"}).exec(function (err, userList)
    {
        callback(err, userList);
    });
};

module.exports.getUserData = getUserData;
module.exports.getSuperUsers = getSuperUsers;
