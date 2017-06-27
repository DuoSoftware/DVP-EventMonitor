/**
 * Created by dinusha on 4/22/2015.
 */
module.exports = {
    Freeswitch: {
        ip: 'SYS_FREESWITCH_HOST',
        port: 'SYS_EVENTSOCKET_PORT',
        password: 'SYS_FREESWITCH_EVENTSOCKET_PASSWORD',
        httport: 'SYS_XMLRPC_PORT'
    },

    "DB": {
        "Type":"SYS_DATABASE_TYPE",
        "User":"SYS_DATABASE_POSTGRES_USER",
        "Password":"SYS_DATABASE_POSTGRES_PASSWORD",
        "Port":"SYS_SQL_PORT",
        "Host":"SYS_DATABASE_HOST",
        "Database":"SYS_DATABASE_POSTGRES_USER"
    },

    Dialer: {
        ip: 'SYS_DIALER_HOST',
        port: 'SYS_DIALER_PORT'
    },

    ARDS: {
        ip: 'SYS_ARDSLITESERVICE_HOST',
        port: 'SYS_ARDSLITESERVICE_PORT',
        version: 'SYS_ARDSLITESERVICE_VERSION'
    },

    NS: {
        ip: 'SYS_NOTIFICATIONSERVICE_HOST',
        port: 'SYS_NOTIFICATIONSERVICE_PORT',
        version: 'SYS_NOTIFICATIONSERVICE_VERSION'
    },

    Services : {
        interactionServiceHost: "SYS_INTERACTIONS_HOST",
        interactionServicePort: "SYS_INTERACTIONS_PORT",
        interactionServiceVersion: "SYS_INTERACTIONS_VERSION",
        dccaclientHost: "SYS_DIAMETERCLIENT_HOST",
        dccaclientPort: "SYS_DIAMETERCLIENT_PORT",
        dccaclientVersion: "SYS_DIAMETERCLIENT_VERSION"
    },


    WebAPI: {

        domain: 'WEBAPI_DOMAIN',
        port: 'WEBAPI_PORT',
        path: 'WEBAPI_PATH'
    },

    Redis: {
        ip: 'SYS_REDIS_HOST',
        port: 'SYS_REDIS_PORT',
        password: "SYS_REDIS_PASSWORD",
        db: "SYS_REDIS_DB_PROCESSEDCDR"
    },

    "RabbitMQ":
    {
        "ip": "SYS_RABBITMQ_HOST",
        "port": "SYS_RABBITMQ_PORT",
        "user": "SYS_RABBITMQ_USER",
        "password": "SYS_RABBITMQ_PASSWORD",
        "vhost":"SYS_RABBITMQ_VHOST"
    },

    Mongo:
    {
        "ip":"SYS_MONGO_HOST",
        "port":"SYS_MONGO_PORT",
        "dbname":"SYS_MONGO_DB",
        "password":"SYS_MONGO_PASSWORD",
        "user":"SYS_MONGO_USER",
        "replicaset" :"SYS_MONGO_REPLICASETNAME"
    },

    Token: "HOST_TOKEN",
    billingEnabled: "SYS_BILLING_ENABLED",
    evtConsumeType: "HOST_EVENT_CONSUME_TYPE"
};
