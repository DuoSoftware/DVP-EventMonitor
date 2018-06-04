module.exports = {
    "Freeswitch": {
        ip: '',
        port: 8021,
        password: 'ClueCon',
        httport: 8080
    },

    "DB": {
        "Type":"postgres",
        "User":"",
        "Password":"",
        "Port":5432,
        "Host":"",
        "Database":""
    },

    Dialer: {
        ip: '',
        port: 2223
    },

    ARDS: {
        ip: '',
        port: 2225,
        version: '1.0.0.0'
    },

    NS: {
        ip: '',
        port: 8089,
        version: '1.0.0.0'
    },

    Services : {
        interactionServiceHost: "",
        interactionServicePort: "3637",
        interactionServiceVersion: "1.0.0.0",
        dccaclientHost: "127.0.0.1",
        dccaclientPort: 4555,
        dccaclientVersion: "1.0.0.0"
    },

    WebAPI: {

        domain: '',
        port: 80,
        path: '/CSReqWebApi/api/'
    },

    
    "Redis":
    {
        "mode":"instance",//instance, cluster, sentinel
        "ip": "",
        "port": 6389,
        "user": "",
        "password": "",
        "db": 4,
        "sentinels":{
            "hosts": "",
            "port":16389,
            "name":"redis-cluster"
        }

    },

    RabbitMQ: {
        "ip":"",
        "port":"5672",
        "user": "",
        "password": "",
        "vhost":'/'
    },

    Mongo:
    {
        "ip":"",
        "port":"27017",
        "dbname":"",
        "password":"",
        "user":"",
        "replicaset" :""
    },

    Token: "",
    billingEnabled: false,
    evtConsumeType: 'amqp',
    UseDashboardAMQP: 'true',
    EventPublishMethod: 'amqp',
    UseCDRGen: false
};
