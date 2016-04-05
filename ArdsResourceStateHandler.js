var config = require('config');
var httpReq = require('request');
var util = require('util');
var validator = require('validator');
var logger = require('dvp-common/LogHandler/CommonLogHandler.js').logger;

var token = config.Token;

var SendResourceStatus = function(reqId, event, state)
{
    try
    {
        var ardsClientUuid = event.getHeader('variable_ards_client_uuid');

        if(ardsClientUuid)
        {
            var ardsCompany = event.getHeader('variable_companyid');
            var ardsTenant = event.getHeader('variable_tenantid');
            var ardsServerType = event.getHeader('variable_ards_server_type');
            var ardsReqType = event.getHeader('variable_ards_request_type');
            var ardsResourceId = event.getHeader('variable_ards_resource_id');

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


                var jsonObj = { ServerType: ardsServerType, RequestType: ardsReqType, State: state, OtherInfo: "", Company: ardsCompany, Tenant: ardsTenant };

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
