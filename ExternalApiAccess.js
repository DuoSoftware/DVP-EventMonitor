var httpReq = require("request");
var config = require("config");
var util = require("util");
var validator = require("validator");
var logger = require("dvp-common-lite/LogHandler/CommonLogHandler.js").logger;

//Dialer

var token = config.Token;

var dccaclientHost = config.Services.dccaclientHost;
var dccaclientPort = config.Services.dccaclientPort;
var dccaclientVersion = config.Services.dccaclientVersion;
var billingEnabled = config.billingEnabled;

var BillCall = function (
  reqId,
  uuid,
  from,
  to,
  type,
  provider,
  companyId,
  tenantId
) {
  if (billingEnabled && billingEnabled === "true") {
    logger.debug("[DVP-EventMonitor.BillCall] - [%s] -  bill call", reqId);

    var httpUrl = util.format(
      "http://%s/DVP/API/%s/dcca/billcall",
      dccaclientHost,
      dccaclientVersion
    );

    if (config.dynamicPort || validator.isIP(dccaclientHost)) {
      httpUrl = util.format(
        "http://%s:%s/DVP/API/%s/dcca/billcall",
        dccaclientHost,
        dccaclientPort,
        dccaclientVersion
      );
    }

    var jsonObj = {
      csid: uuid,
      to: to,
      from: from,
      type: type,
      provider: provider,
    };

    var compInfo = tenantId + ":" + companyId;

    var jsonStr = JSON.stringify(jsonObj);

    var options = {
      url: httpUrl,
      method: "POST",
      headers: {
        authorization: "bearer " + token,
        companyinfo: compInfo,
        "content-type": "application/json",
      },
      body: jsonStr,
    };

    logger.debug(
      "[DVP-EventMonitor.BillCall] - [%s] - Creating Api Url : %s , DATA : %s",
      reqId,
      httpUrl,
      jsonStr
    );

    httpReq.post(options, function (error, response, body) {
      if (!error && response.statusCode == 200) {
        logger.debug(
          "[DVP-EventMonitor.BillCall] - [%s] - Bill call Api returned : %s",
          reqId,
          body
        );
      } else {
        logger.error(
          "[DVP-EventMonitor.BillCall] - [%s] - Bill call Api call failed",
          reqId,
          error
        );
      }
    });
  } else {
    logger.debug(
      "[DVP-EventMonitor.BillCall] - [%s] -  Billing not enabled",
      reqId
    );
  }
};

var BillEndCall = function (reqId, uuid, from, to, type, companyId, tenantId) {
  if (billingEnabled && billingEnabled === "true") {
    logger.debug("[DVP-EventMonitor.BillEndCall] - [%s] -  end call", reqId);

    var httpUrl = util.format(
      "http://%s/DVP/API/%s/dcca/endcall",
      dccaclientHost,
      dccaclientVersion
    );

    if (config.dynamicPort || validator.isIP(dccaclientHost)) {
      httpUrl = util.format(
        "http://%s:%s/DVP/API/%s/dcca/endcall",
        dccaclientHost,
        dccaclientPort,
        dccaclientVersion
      );
    }

    var jsonObj = {
      csid: uuid,
      to: to,
      from: from,
      type: type,
      dsid: "1830913305",
    };

    var compInfo = tenantId + ":" + companyId;

    var jsonStr = JSON.stringify(jsonObj);

    var options = {
      url: httpUrl,
      method: "POST",
      headers: {
        authorization: "bearer " + token,
        companyinfo: compInfo,
        "content-type": "application/json",
      },
      body: jsonStr,
    };

    logger.debug(
      "[DVP-EventMonitor.BillEndCall] - [%s] - Creating Api Url : %s , DATA : %s",
      reqId,
      httpUrl,
      jsonStr
    );

    httpReq.post(options, function (error, response, body) {
      if (!error && response.statusCode == 200) {
        logger.debug(
          "[DVP-EventMonitor.BillEndCall] - [%s] - Bill call Api returned : %s",
          reqId,
          body
        );
      } else {
        logger.error(
          "[DVP-EventMonitor.BillEndCall] - [%s] - Bill call Api call failed",
          reqId,
          error
        );
      }
    });
  } else {
    logger.debug(
      "[DVP-EventMonitor.BillCall] - [%s] -  Billing not enabled",
      reqId
    );
  }
};

var IncrementMaxChanLimit = function (reqId, campId, securityToken, callback) {
  try {
    logger.debug(
      "[DVP-EventMonitor.IncrementMaxChanLimit] - [%s] -  Creating Post Message",
      reqId
    );

    var dialerIp = config.Dialer.ip;
    var dialerPort = config.Dialer.port;

    if (dialerIp) {
      var httpUrl = util.format(
        "http://%s/DVP/DialerAPI/IncrMaxChannelLimit",
        dialerIp
      );

      if (config.dynamicPort || validator.isIP(dialerIp)) {
        httpUrl = util.format(
          "http://%s:%d/DVP/DialerAPI/IncrMaxChannelLimit",
          dialerIp,
          dialerPort
        );
      }

      var jsonStr = campId;

      var options = {
        url: httpUrl,
        method: "POST",
        headers: {
          authorization: securityToken,
          "content-type": "application/json",
        },
        body: jsonStr,
      };

      logger.debug(
        "[DVP-EventMonitor.IncrementMaxChanLimit] - [%s] - Creating Api Url : %s",
        reqId,
        httpUrl
      );

      httpReq.post(options, function (error, response, body) {
        if (
          !error &&
          response.statusCode >= 200 &&
          response.statusCode <= 299
        ) {
          logger.debug(
            "[DVP-EventMonitor.IncrementMaxChanLimit] - [%s] - Increment Limit Success : %s",
            reqId,
            body
          );

          callback(undefined, true);
        } else {
          logger.error(
            "[DVP-EventMonitor.IncrementMaxChanLimit] - [%s] - Increment Limit Fail",
            reqId,
            error
          );
          callback(error, false);
        }
      });
    } else {
      logger.error(
        "[DVP-EventMonitor.IncrementMaxChanLimit] - [%s] - Dialer Endpoints not defined",
        reqId,
        error
      );
      callback(new Error("Dialer Endpoints not defined"), false);
    }
  } catch (ex) {
    logger.error(
      "[DVP-EventMonitor.IncrementMaxChanLimit] - [%s] - Exception occurred",
      reqId,
      ex
    );
    callback(ex, false);
  }
};

var DecrementMaxChanLimit = function (reqId, campId, securityToken, callback) {
  try {
    logger.debug(
      "[DVP-EventMonitor.DecrementMaxChanLimit] - [%s] -  Creating Post Message",
      reqId
    );

    var dialerIp = config.Dialer.ip;
    var dialerPort = config.Dialer.port;

    if (dialerIp) {
      var httpUrl = util.format(
        "http://%s/DVP/DialerAPI/DecrMaxChannelLimit",
        dialerIp
      );

      if (config.dynamicPort || validator.isIP(dialerIp)) {
        httpUrl = util.format(
          "http://%s:%d/DVP/DialerAPI/DecrMaxChannelLimit",
          dialerIp,
          dialerPort
        );
      }

      var jsonStr = campId;

      var options = {
        url: httpUrl,
        method: "POST",
        headers: {
          authorization: securityToken,
          "content-type": "application/json",
        },
        body: jsonStr,
      };

      logger.debug(
        "[DVP-EventMonitor.DecrementMaxChanLimit] - [%s] - Creating Api Url : %s",
        reqId,
        httpUrl
      );

      httpReq.post(options, function (error, response, body) {
        if (
          !error &&
          response.statusCode >= 200 &&
          response.statusCode <= 299
        ) {
          logger.debug(
            "[DVP-EventMonitor.DecrementMaxChanLimit] - [%s] - Decrement Limit Success : %s",
            reqId,
            body
          );

          callback(undefined, true);
        } else {
          logger.error(
            "[DVP-EventMonitor.DecrementMaxChanLimit] - [%s] - Decrement Limit Fail",
            reqId,
            error
          );
          callback(error, false);
        }
      });
    } else {
      logger.error(
        "[DVP-EventMonitor.DecrementMaxChanLimit] - [%s] - Dialer Endpoints not defined",
        reqId,
        error
      );
      callback(new Error("Dialer Endpoints not defined"), false);
    }
  } catch (ex) {
    logger.error(
      "[DVP-EventMonitor.DecrementMaxChanLimit] - [%s] - Exception occurred",
      reqId,
      ex
    );
    callback(ex, false);
  }
};

var SetMaxChanLimit = function (
  reqId,
  campId,
  maxLimit,
  securityToken,
  callback
) {
  try {
    logger.debug(
      "[DVP-EventMonitor.SetMaxChanLimit] - [%s] -  Creating Post Message",
      reqId
    );

    var dialerIp = config.Dialer.ip;
    var dialerPort = config.Dialer.port;

    if (dialerIp) {
      var httpUrl = util.format(
        "http://%s/DVP/DialerAPI/SetMaxChannelLimit",
        dialerIp
      );

      if (config.dynamicPort || validator.isIP(dialerIp)) {
        httpUrl = util.format(
          "http://%s:%d/DVP/DialerAPI/SetMaxChannelLimit",
          dialerIp,
          dialerPort
        );
      }

      var jsonStr = campId + "_" + maxLimit;

      var options = {
        url: httpUrl,
        method: "POST",
        headers: {
          authorization: securityToken,
          "content-type": "application/json",
        },
        body: jsonStr,
      };

      logger.debug(
        "[DVP-EventMonitor.SetMaxChanLimit] - [%s] - Creating Api Url : %s",
        reqId,
        httpUrl
      );

      httpReq.post(options, function (error, response, body) {
        if (
          !error &&
          response.statusCode >= 200 &&
          response.statusCode <= 299
        ) {
          logger.debug(
            "[DVP-EventMonitor.SetMaxChanLimit] - [%s] - Set Limit Success : %s",
            reqId,
            body
          );

          callback(undefined, true);
        } else {
          logger.error(
            "[DVP-EventMonitor.SetMaxChanLimit] - [%s] - Set Limit Fail",
            reqId,
            error
          );
          callback(error, false);
        }
      });
    } else {
      logger.error(
        "[DVP-EventMonitor.SetMaxChanLimit] - [%s] - Dialer Endpoints not defined",
        reqId,
        error
      );
      callback(new Error("Dialer Endpoints not defined"), false);
    }
  } catch (ex) {
    logger.error(
      "[DVP-EventMonitor.SetMaxChanLimit] - [%s] - Exception occurred",
      reqId,
      ex
    );
    callback(ex, false);
  }
};

var GetModCallCenterAgentCount = function (reqId, campId, callback) {
  try {
    logger.debug(
      "[DVP-EventMonitor.GetModCallCenterAgentCount] - [%s] -  Trying to get Mod Call Center Agent Count From Api",
      reqId
    );
    var fsIp = config.Freeswitch.ip;
    var fsPort = config.Freeswitch.httport;

    if (fsIp) {
      var httpUrl = util.format(
        "http://%s/api/callcenter_config? queue count agents election@%s Available",
        fsIp,
        campId
      );

      if (config.dynamicPort || validator.isIP(fsIp)) {
        httpUrl = util.format(
          "http://%s:%s/api/callcenter_config? queue count agents election@%s Available",
          fsIp,
          fsPort,
          campId
        );
      }

      var options = {
        url: httpUrl,
      };

      logger.debug(
        "[DVP-EventMonitor.GetModCallCenterAgentCount] - [%s] - Creating Api Url : %s",
        reqId,
        httpUrl
      );

      httpReq(options, function (error, response, body) {
        if (
          !error &&
          response.statusCode >= 200 &&
          response.statusCode <= 299
        ) {
          logger.debug(
            "[DVP-EventMonitor.GetModCallCenterAgentCount] - [%s] - FS Agent Count Success : %s",
            reqId,
            body
          );

          callback(undefined, body);
        } else {
          logger.error(
            "[DVP-EventMonitor.GetModCallCenterAgentCount] - [%s] - FS Agent Count Failed",
            reqId,
            error
          );
          callback(error, undefined);
        }
      });
    } else {
      logger.error(
        "[DVP-EventMonitor.GetModCallCenterAgentCount] - [%s] - FS Mod Call Center service ip, port or version not set",
        reqId
      );
      callback(
        new Error("FS Mod Call Center service ip, port or version not set"),
        undefined
      );
    }
  } catch (ex) {
    logger.error(
      "[DVP-EventMonitor.GetModCallCenterAgentCount] - [%s] - Exception occurred",
      reqId,
      ex
    );
    callback(ex, undefined);
  }
};

//Notification Server

var SendNotificationByKey = function (
  reqId,
  eventname,
  eventuuid,
  chanId,
  payload,
  companyId,
  tenantId
) {
  try {
    var nsIp = config.NS.ip;
    var nsPort = config.NS.port;
    var nsVersion = config.NS.version;

    var token = config.Token;

    var httpUrl = util.format(
      "http://%s/DVP/API/%s/NotificationService/Notification/Publish",
      nsIp,
      nsVersion
    );

    if (config.dynamicPort || validator.isIP(nsIp)) {
      httpUrl = util.format(
        "http://%s:%d/DVP/API/%s/NotificationService/Notification/Publish",
        nsIp,
        nsPort,
        nsVersion
      );
    }

    var jsonStr = JSON.stringify(payload);

    var options = {
      url: httpUrl,
      method: "POST",
      headers: {
        authorization: "bearer " + token,
        "content-type": "application/json",
        eventname: eventname,
        eventuuid: eventuuid,
        querykey: chanId,
        companyinfo: tenantId + ":" + companyId,
      },
      body: jsonStr,
    };

    logger.debug(
      "[DVP-EventMonitor.SendNotificationByKey] - [%s] - Creating Api Url : %s",
      reqId,
      httpUrl
    );

    httpReq.post(options, function (error, response, body) {
      if (!error && response.statusCode >= 200 && response.statusCode <= 299) {
        logger.debug(
          "[DVP-EventMonitor.SendNotificationByKey] - [%s] - Send Notification Success : %s",
          reqId,
          body
        );
      } else {
        logger.error(
          "[DVP-EventMonitor.SendNotificationByKey] - [%s] - Send Notification Fail",
          reqId,
          error
        );
      }
    });
  } catch (ex) {
    logger.error(
      "[DVP-EventMonitor.SendNotificationByKey] - [%s] - ERROR Occurred",
      reqId,
      ex
    );
  }
};

var SendNotificationInitiate = function (
  reqId,
  eventname,
  eventuuid,
  payload,
  companyId,
  tenantId
) {
  try {
    var nsIp = config.NS.ip;
    var nsPort = config.NS.port;
    var nsVersion = config.NS.version;

    var token = config.Token;

    var httpUrl = util.format(
      "http://%s/DVP/API/%s/NotificationService/Notification/initiate",
      nsIp,
      nsVersion
    );

    if (config.dynamicPort || validator.isIP(nsIp)) {
      httpUrl = util.format(
        "http://%s:%d/DVP/API/%s/NotificationService/Notification/initiate",
        nsIp,
        nsPort,
        nsVersion
      );
    }

    var jsonStr = JSON.stringify(payload);

    var options = {
      url: httpUrl,
      method: "POST",
      headers: {
        authorization: "bearer " + token,
        "content-type": "application/json",
        eventname: eventname,
        eventuuid: eventuuid,
        companyinfo: tenantId + ":" + companyId,
      },
      body: jsonStr,
    };

    logger.debug(
      "[DVP-EventMonitor.SendNotificationByKey] - [%s] - Creating Api Url : %s - Body : ",
      reqId,
      httpUrl,
      jsonStr
    );

    httpReq.post(options, function (error, response, body) {
      if (!error && response.statusCode >= 200 && response.statusCode <= 299) {
        logger.debug(
          "[DVP-EventMonitor.SendNotificationByKey] - [%s] - Send Notification Success : %s",
          reqId,
          body
        );
      } else {
        logger.error(
          "[DVP-EventMonitor.SendNotificationByKey] - [%s] - Send Notification Fail",
          reqId,
          error
        );
      }
    });
  } catch (ex) {
    logger.error(
      "[DVP-EventMonitor.SendNotificationByKey] - [%s] - ERROR Occurred",
      reqId,
      ex
    );
  }
};

var SendNotificationBroadcast = function (
  reqId,
  eventname,
  eventuuid,
  payload,
  companyId,
  tenantId
) {
  try {
    var nsIp = config.NS.ip;
    var nsPort = config.NS.port;
    var nsVersion = config.NS.version;

    var token = config.Token;

    var httpUrl = util.format(
      "http://%s/DVP/API/%s/NotificationService/Notification/Broadcast",
      nsIp,
      nsVersion
    );

    if (config.dynamicPort || validator.isIP(nsIp)) {
      httpUrl = util.format(
        "http://%s:%d/DVP/API/%s/NotificationService/Notification/Broadcast",
        nsIp,
        nsPort,
        nsVersion
      );
    }

    var jsonStr = JSON.stringify(payload);

    var options = {
      url: httpUrl,
      method: "POST",
      headers: {
        authorization: "bearer " + token,
        "content-type": "application/json",
        eventname: eventname,
        eventuuid: eventuuid,
        companyinfo: tenantId + ":" + companyId,
      },
      body: jsonStr,
    };

    logger.debug(
      "[DVP-EventMonitor.SendNotificationBroadcast] - [%s] - Creating Api Url : %s",
      reqId,
      httpUrl
    );

    httpReq.post(options, function (error, response, body) {
      if (!error && response.statusCode >= 200 && response.statusCode <= 299) {
        logger.debug(
          "[DVP-EventMonitor.SendNotificationBroadcast] - [%s] - Send Notification Success : %s",
          reqId,
          body
        );
      } else {
        logger.error(
          "[DVP-EventMonitor.SendNotificationBroadcast] - [%s] - Send Notification Fail",
          reqId,
          error
        );
      }
    });
  } catch (ex) {
    logger.error(
      "[DVP-EventMonitor.SendNotificationBroadcast] - [%s] - ERROR Occurred",
      reqId,
      ex
    );
  }
};

var CreateEngagement = function (
  reqId,
  sessionId,
  channel,
  direction,
  from,
  to,
  companyId,
  tenantId
) {
  try {
    var engIp = config.Services.interactionServiceHost;
    var engPort = config.Services.interactionServicePort;
    var engVersion = config.Services.interactionServiceVersion;

    var token = config.Token;

    var httpUrl = util.format(
      "http://%s/DVP/API/%s/EngagementSessionForProfile",
      engIp,
      engVersion
    );

    if (config.dynamicPort || validator.isIP(engIp)) {
      httpUrl = util.format(
        "http://%s:%d/DVP/API/%s/EngagementSessionForProfile",
        engIp,
        engPort,
        engVersion
      );
    }

    var payload = {
      engagement_id: sessionId,
      channel: channel,
      direction: direction,
      channel_from: from,
      channel_to: to,
    };

    var jsonStr = JSON.stringify(payload);

    var options = {
      url: httpUrl,
      method: "POST",
      headers: {
        authorization: "bearer " + token,
        "content-type": "application/json",
        companyinfo: tenantId + ":" + companyId,
      },
      body: jsonStr,
    };

    logger.debug(
      "[DVP-EventMonitor.CreateEngagement] - [%s] - Creating Api Url : %s",
      reqId,
      httpUrl
    );

    httpReq.post(options, function (error, response, body) {
      if (!error && response.statusCode >= 200 && response.statusCode <= 299) {
        logger.debug(
          "[DVP-EventMonitor.CreateEngagement] - [%s] - Create engagement Success : %s",
          reqId,
          body
        );
      } else {
        logger.error(
          "[DVP-EventMonitor.CreateEngagement] - [%s] - Create engagement fail",
          reqId,
          error
        );
      }
    });
  } catch (ex) {
    logger.error(
      "[DVP-EventMonitor.CreateEngagement] - [%s] - ERROR Occurred",
      reqId,
      ex
    );
  }
};

module.exports.IncrementMaxChanLimit = IncrementMaxChanLimit;
module.exports.DecrementMaxChanLimit = DecrementMaxChanLimit;
module.exports.GetModCallCenterAgentCount = GetModCallCenterAgentCount;
module.exports.SetMaxChanLimit = SetMaxChanLimit;
module.exports.SendNotificationByKey = SendNotificationByKey;
module.exports.SendNotificationInitiate = SendNotificationInitiate;
module.exports.SendNotificationBroadcast = SendNotificationBroadcast;
module.exports.CreateEngagement = CreateEngagement;
module.exports.BillCall = BillCall;
module.exports.BillEndCall = BillEndCall;
