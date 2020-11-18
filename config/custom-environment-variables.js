/**
 * Created by dinusha on 4/22/2015.
 */
module.exports = {
  EmailSendMethod: "SYS_EMAIL_SEND_METHOD",

  Freeswitch: {
    ip: "SYS_FREESWITCH_HOST",
    port: "SYS_EVENTSOCKET_PORT",
    password: "SYS_FREESWITCH_EVENTSOCKET_PASSWORD",
    httport: "SYS_XMLRPC_PORT",
  },

  DB: {
    Type: "SYS_DATABASE_TYPE",
    User: "SYS_DATABASE_POSTGRES_USER",
    Password: "SYS_DATABASE_POSTGRES_PASSWORD",
    Port: "SYS_SQL_PORT",
    Host: "SYS_DATABASE_HOST",
    Database: "SYS_DATABASE_NAME",
  },

  Dialer: {
    ip: "SYS_DIALER_HOST",
    port: "SYS_DIALER_PORT",
  },

  ARDS: {
    ip: "SYS_ARDSLITESERVICE_HOST",
    port: "SYS_ARDSLITESERVICE_PORT",
    version: "SYS_ARDSLITESERVICE_VERSION",
  },

  NS: {
    ip: "SYS_NOTIFICATIONSERVICE_HOST",
    port: "SYS_NOTIFICATIONSERVICE_PORT",
    version: "SYS_NOTIFICATIONSERVICE_VERSION",
  },

  Services: {
    accessToken : "HOST_TOKEN",
    resourceServiceHost : "SYS_RESOURCESERVICE_HOST",
    resourceServicePort : "SYS_RESOURCESERVICE_PORT",
    resourceServiceVersion : "SYS_RESOURCESERVICE_VERSION",
    uploadurl : "SYS_FILESERVICE_HOST",
    uploadport :"SYS_FILESERVICE_PORT",
    uploadurlVersion: "SYS_FILESERVICE_VERSION",

    interactionServiceHost: "SYS_INTERACTIONS_HOST",
    interactionServicePort: "SYS_INTERACTIONS_PORT",
    interactionServiceVersion: "SYS_INTERACTIONS_VERSION",
    dccaclientHost: "SYS_DIAMETERCLIENT_HOST",
    dccaclientPort: "SYS_DIAMETERCLIENT_PORT",
    dccaclientVersion: "SYS_DIAMETERCLIENT_VERSION",

    cronurl : "SYS_SCHEDULEWORKER_HOST",
    cronport : "SYS_SCHEDULEWORKER_PORT",
    cronversion :"SYS_SCHEDULEWORKER_VERSION",


    ticketServiceHost : "SYS_LITETICKET_HOST",
    ticketServicePort :  "SYS_LITETICKET_PORT",
    ticketServiceVersion :  "SYS_LITETICKET_VERSION",
  },

  WebAPI: {
    domain: "WEBAPI_DOMAIN",
    port: "WEBAPI_PORT",
    path: "WEBAPI_PATH",
  },

  Redis: {
    mode: "SYS_REDIS_MODE",
    ip: "SYS_REDIS_HOST",
    port: "SYS_REDIS_PORT",
    user: "SYS_REDIS_USER",
    password: "SYS_REDIS_PASSWORD",
    db: "SYS_REDIS_DB",
    sentinels: {
      hosts: "SYS_REDIS_SENTINEL_HOSTS",
      port: "SYS_REDIS_SENTINEL_PORT",
      name: "SYS_REDIS_SENTINEL_NAME",
    },
  },

  RabbitMQ: {
    ip: "SYS_RABBITMQ_HOST",
    port: "SYS_RABBITMQ_PORT",
    user: "SYS_RABBITMQ_USER",
    password: "SYS_RABBITMQ_PASSWORD",
    vhost: "SYS_RABBITMQ_VHOST",
  },

  Mongo: {
    ip: "SYS_MONGO_HOST",
    port: "SYS_MONGO_PORT",
    dbname: "SYS_MONGO_DB",
    password: "SYS_MONGO_PASSWORD",
    user: "SYS_MONGO_USER",
    replicaset: "SYS_MONGO_REPLICASETNAME",
    type: "SYS_MONGO_TYPE",

  },

  SMSServer: {
    ip: "SYS_SMSSERVER_HOST",
    port: "SYS_SMSSERVER_PORT",
    password: "SYS_SMSSERVER_PASSWORD",
    user: "SYS_SMSSERVER_USER",
  },

  SMTP: {
    ip: "SYS_SMTP_HOST",
    port: "SYS_SMTP_PORT",
    user: "SYS_SMTP_USER",
    password: "SYS_SMTP_PASSWORD"
  },

  Token: "HOST_TOKEN",
  billingEnabled: "SYS_BILLING_ENABLED",
  evtConsumeType: "HOST_EVENT_CONSUME_TYPE",
  UseDashboardAMQP: "HOST_USE_DASHBOARD_MSG_QUEUE",
  EventPublishMethod: "HOST_DVPEVENTS_TYPE",
  UseCDRGen: "HOST_USE_CDR_GEN",
};
