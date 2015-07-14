var httpReq = require('request');
var config = require('config');
var util = require('util');
var logger = require('DVP-Common/LogHandler/CommonLogHandler.js').logger;

var IncrementMaxChanLimit = function(reqId, campId, securityToken, callback)
{
    try
    {
        logger.debug('[DVP-EventMonitor.IncrementMaxChanLimit] - [%s] -  Creating Post Message', reqId);

        var dialerIp = config.Dialer.ip;
        var dialerPort = config.Dialer.port;

        if(dialerIp && dialerPort)
        {
            var httpUrl = util.format('http://%s:%d/DialerSelfHost/Campaign/IncrMaxChannelLimit', dialerIp, dialerPort);

            var jsonStr = campId;

            var options = {
                url: httpUrl,
                method: 'POST',
                headers: {
                    'authorization': securityToken,
                    'content-type': 'application/json'
                },
                body: jsonStr
            };

            logger.debug('[DVP-EventMonitor.IncrementMaxChanLimit] - [%s] - Creating Api Url : %s', reqId, httpUrl);


            httpReq.post(options, function (error, response, body)
            {
                if (!error && response.statusCode >= 200 && response.statusCode <= 299)
                {
                    logger.debug('[DVP-EventMonitor.IncrementMaxChanLimit] - [%s] - Increment Limit Success : %s', reqId, body);

                    callback(undefined, true);
                }
                else
                {
                    logger.error('[DVP-EventMonitor.IncrementMaxChanLimit] - [%s] - Increment Limit Fail', reqId, error);
                    callback(error, false);
                }
            })
        }
        else
        {
            logger.error('[DVP-EventMonitor.IncrementMaxChanLimit] - [%s] - Dialer Endpoints not defined', reqId, error);
            callback(new Error('Dialer Endpoints not defined'), false);
        }

    }
    catch(ex)
    {
        logger.error('[DVP-EventMonitor.IncrementMaxChanLimit] - [%s] - Exception occurred', reqId, ex);
        callback(ex, undefined);
    }
};

var DecrementMaxChanLimit = function(reqId, campId, securityToken, callback)
{
    try
    {
        logger.debug('[DVP-EventMonitor.DecrementMaxChanLimit] - [%s] -  Creating Post Message', reqId);

        var dialerIp = config.Dialer.ip;
        var dialerPort = config.Dialer.port;

        if(dialerIp && dialerPort)
        {
            var httpUrl = util.format('http://%s:%d/DialerSelfHost/Campaign/DecrMaxChannelLimit', dialerIp, dialerPort);

            var jsonStr = campId;

            var options = {
                url: httpUrl,
                method: 'POST',
                headers: {
                    'authorization': securityToken,
                    'content-type': 'application/json'
                },
                body: jsonStr
            };

            logger.debug('[DVP-EventMonitor.DecrementMaxChanLimit] - [%s] - Creating Api Url : %s', reqId, httpUrl);


            httpReq.post(options, function (error, response, body)
            {
                if (!error && response.statusCode >= 200 && response.statusCode <= 299)
                {
                    logger.debug('[DVP-EventMonitor.DecrementMaxChanLimit] - [%s] - Decrement Limit Success : %s', reqId, body);

                    callback(undefined, true);
                }
                else
                {
                    logger.error('[DVP-EventMonitor.DecrementMaxChanLimit] - [%s] - Decrement Limit Fail', reqId, error);
                    callback(error, false);
                }
            })
        }
        else
        {
            logger.error('[DVP-EventMonitor.DecrementMaxChanLimit] - [%s] - Dialer Endpoints not defined', reqId, error);
            callback(new Error('Dialer Endpoints not defined'), false);
        }

    }
    catch(ex)
    {
        logger.error('[DVP-EventMonitor.DecrementMaxChanLimit] - [%s] - Exception occurred', reqId, ex);
        callback(ex, undefined);
    }
};

module.exports.IncrementMaxChanLimit = IncrementMaxChanLimit;
module.exports.DecrementMaxChanLimit = DecrementMaxChanLimit;