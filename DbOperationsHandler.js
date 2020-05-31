var dbModel = require('dvp-dbmodels');
var logger = require('dvp-common-lite/LogHandler/CommonLogHandler.js').logger;

var AddPresenceDB = function(username, domain, status)
{
    try
    {
        var sipPres = dbModel.SipPresence.build({
            SipUsername: username,
            Domain: domain,
            Status: status
        });
        sipPres
            .save()
            .then(function (res)
            {

            })
            .catch(function(err)
            {
                logger.error('[DVP-EventMonitor.AddPresenceDB] - [%s] - Exception occurred - Error : ', err);
            })
    }
    catch(ex)
    {
        logger.error('[DVP-EventMonitor.AddPresenceDB] - [%s] - Exception occurred - Error : ', ex);
    }
};

var UpdatePresenceDB = function(username, status)
{
    try
    {
        dbModel.SipPresence
            .update({Status: status},{where: [{SipUsername: username}]
            })
            .then(function (res)
            {

            })
            .catch(function(err)
            {
                logger.error('[DVP-EventMonitor.UpdatePresenceDB] - [%s] - Exception occurred - Error : ', err);
            })

    }
    catch(ex)
    {
        logger.error('[DVP-EventMonitor.UpdatePresenceDB] - [%s] - Exception occurred - Error : ', ex);
    }
};

var DeletePresenceDB = function(username)
{
    try
    {
        dbModel.SipPresence
            .destroy({where: [{SipUsername: username}]
            })
            .then(function (res)
            {

            })
            .catch(function(err)
            {
                logger.error('[DVP-EventMonitor.DeletePresenceDB] - [%s] - Exception occurred - Error : ', err);
            })
    }
    catch(ex)
    {
        logger.error('[DVP-EventMonitor.DeletePresenceDB] - [%s] - Exception occurred - Error : ', ex);
    }
};

var GetConferenceRoom = function(roomName, callback)
{
    try
    {
        dbModel.ConferenceUser.find({where: [{ConferenceId: roomName}]})
            .then(function (conf)
            {
                callback(null, conf);

            }).catch(function(err)
            {
                callback(err, null);

            })
    }
    catch(ex)
    {
        callback(ex, null);
    }

}

var getUserDetailsByDomain = function(username, domain, callback)
{
    try
    {
        dbModel.SipUACEndpoint.find({where: {SipUsername: username}, include: [{model: dbModel.CloudEndUser, as: "CloudEndUser", where: {Domain: domain}}, {model: dbModel.Extension, as: "Extension"}]})
            .then(function (usr)
            {
                callback(null, usr);

            }).catch(function(err)
            {
                callback(err, null);

            })
    }
    catch(ex)
    {
        callback(ex, null);
    }
};


var SetConferenceMemberStatus = function(roomName, membername)
{
    try
    {
        dbModel.ConferenceUser.find({where: [{ConferenceId: roomName}], include:[{model: dbModel.SipUACEndpoint, as:"SipUACEndpoint", where:[{SipUsername: membername}]}]})
            .then(function (confUser)
            {
                if(confUser)
                {

                    confUser.updateAttributes({UserStatus: 'JOINED'}).then(function(updateResult)
                    {

                    }).catch(function(err)
                    {
                        logger.error('[DVP-EventMonitor.SetConferenceMemberStatus] - [%s] - Update Conference User Status Fail', err);
                    })

                }
                else
                {
                    logger.error('[DVP-EventMonitor.SetConferenceMemberStatus] - [%s] - Conference user not found');
                }
            })
            .catch(function(err)
            {
                logger.error('[DVP-EventMonitor.SetConferenceMemberStatus] - [%s] - Update Conference User Status Fail', err);
            });
    }
    catch(ex)
    {
        logger.error('[DVP-EventMonitor.SetConferenceMemberStatus] - [%s] - Update Conference User Status Fail', ex);
    }

}

module.exports.AddPresenceDB = AddPresenceDB;
module.exports.UpdatePresenceDB = UpdatePresenceDB;
module.exports.DeletePresenceDB = DeletePresenceDB;
module.exports.SetConferenceMemberStatus = SetConferenceMemberStatus;
module.exports.GetConferenceRoom = GetConferenceRoom;
module.exports.getUserDetailsByDomain = getUserDetailsByDomain;