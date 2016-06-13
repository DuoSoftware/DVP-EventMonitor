var config = require('config');
var httpReq = require('request');
var util = require('util');
var validator = require('validator');
var logger = require('dvp-common/LogHandler/CommonLogHandler.js').logger;
var winston = require('winston');

var loggerCust = new winston.Logger();

var level = 'debug';

var token = config.Token;

loggerCust.add(winston.transports.File, {filename: '/logs/ards_logger.log', level: level, maxsize:1242880, maxFiles:10});

var SendResourceStatus = function(reqId, ardsClientUuid, ardsCompany, ardsTenant, ardsServerType, ardsReqType, ardsResourceId, state, otherInfo, reason)
{
    try
    {
        if(ardsClientUuid)
        {

            logger.debug('[DVP-EventMonitor.SendResourceStatus] - [%s] -  Creating PUT Message', reqId);

            var ardsIp = config.ARDS.ip;
            var ardsPort = config.ARDS.port;
            var ardsVersion = config.ARDS.version;

            if(ardsIp && ardsPort && ardsVersion)
            {
                var securityToken = 'bearer ' + token;

                var companyInfoHeader = ardsTenant + ':' + ardsCompany;

                var httpUrl = util.format('http://%s/DVP/API/%s/ARDS/resource/%s/concurrencyslot/session/%s', ardsIp, ardsVersion, ardsResourceId, ardsClientUuid);

                if(validator.isIP(ardsIp))
                {
                    httpUrl = util.format('http://%s:%d/DVP/API/%s/ARDS/resource/%s/concurrencyslot/session/%s', ardsIp, ardsPort, ardsVersion, ardsResourceId, ardsClientUuid);
                }


                var jsonObj = { ServerType: ardsServerType, RequestType: ardsReqType, State: state, OtherInfo: otherInfo, Reason: reason, Company: ardsCompany, Tenant: ardsTenant };

                var jsonStr = JSON.stringify(jsonObj);

                var options = {
                    url: httpUrl,
                    method: 'PUT',
                    headers: {
                        'authorization': securityToken,
                        'companyinfo': companyInfoHeader,
                        'content-type': 'application/json'
                    },
                    body: jsonStr
                };

                logger.debug('[DVP-EventMonitor.SendResourceStatus] - [%s] - Creating Api Url : %s, state : %s', reqId, httpUrl, state);

                loggerCust.debug('SendResourceStatus - START - [UUID : %s , State : %s' , ardsClientUuid, state);


                httpReq.put(options, function (error, response, body)
                {
                    if (!error && response.statusCode >= 200 && response.statusCode <= 299)
                    {
                        logger.debug('[DVP-EventMonitor.SendResourceStatus] - [%s] - Set Resource Status Success : %s', reqId, body);
                    }
                    else
                    {
                        loggerCust.error('SendResourceStatus - FAIL - [UUID : %s , State : %s' , ardsClientUuid, state, error);
                        logger.error('[DVP-EventMonitor.SendResourceStatus] - [%s] - Set Resource Status Fail', reqId, error);
                    }
                })
            }
            else
            {
                logger.error('[DVP-EventMonitor.SendResourceStatus] - [%s] - ARDS Endpoints not defined', reqId, error);
            }


        }

    }
    catch(ex)
    {
        logger.error('[DVP-EventMonitor.SendResourceStatus] - [%s] - Exception Occurred', reqId, ex);
    }
};

module.exports.SendResourceStatus = SendResourceStatus;
