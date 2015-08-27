var dbModel = require('DVP-DBModels');
var logger = require('DVP-Common/LogHandler/CommonLogHandler.js').logger;

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

module.exports.AddPresenceDB = AddPresenceDB;
module.exports.UpdatePresenceDB = UpdatePresenceDB;
module.exports.DeletePresenceDB = DeletePresenceDB;