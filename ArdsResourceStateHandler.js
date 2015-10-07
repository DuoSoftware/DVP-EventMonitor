var config = require('config');
var httpReq = require('request');
var util = require('util');
var logger = require('dvp-common/LogHandler/CommonLogHandler.js').logger;

var SendResourceStatus = function(reqId, event, state)
{
    try
    {
        var ardsClientUuid = event.getHeader('variable_ards_client_uuid');

        if(ardsClientUuid)
        {
            var ardsCompany = event.getHeader('variable_ards_company');
            var ardsTenant = event.getHeader('variable_ards_tenant');
            var ardsClass = event.getHeader('variable_ards_class');
            var ardsType = event.getHeader('variable_ards_type');
            var ardsCategory = event.getHeader('variable_ards_category');
            var ardsResourceId = event.getHeader('variable_ards_resource_id');

            logger.debug('[DVP-EventMonitor.SendResourceStatus] - [%s] -  Creating PUT Message', reqId);

            var ardsIp = config.ARDS.ip;
            var ardsPort = config.ARDS.port;
            var ardsVersion = config.ARDS.version;

            if(ardsIp && ardsPort && ardsVersion)
            {
                var securityToken = ardsTenant + '#' + ardsCompany;
                var httpUrl = util.format('http://%s:%d/DVP/API/%s/ARDS/resource/%s/concurrencyslot/session/%s', ardsIp, ardsPort, ardsVersion, ardsResourceId, ardsClientUuid);

                var jsonObj = { ReqClass: ardsClass, ReqType: ardsType, ReqCategory: ardsCategory, State: state, OtherInfo: "" };

                var jsonStr = JSON.stringify(jsonObj);

                var options = {
                    url: httpUrl,
                    method: 'PUT',
                    headers: {
                        'authorization': securityToken,
                        'content-type': 'application/json'
                    },
                    body: jsonStr
                };

                logger.debug('[DVP-EventMonitor.SendResourceStatus] - [%s] - Creating Api Url : %s, state : %s', reqId, httpUrl, state);


                httpReq.put(options, function (error, response, body)
                {
                    if (!error && response.statusCode >= 200 && response.statusCode <= 299)
                    {
                        logger.debug('[DVP-EventMonitor.SendResourceStatus] - [%s] - Set Resource Status Success : %s', reqId, body);
                    }
                    else
                    {
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
