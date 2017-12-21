module.exports = {
    "Freeswitch": {
        ip: '159.203.160.47',
        port: 8021,
        password: 'ClueCon',
        httport: 8080
    },

    "DB": {
        "Type":"postgres",
        "User":"duo",
        "Password":"DuoS123",
        "Port":5432,
        "Host":"104.236.231.11",
        "Database":"duo"
    },

    Dialer: {
        ip: '192.168.0.5',
        port: 2223
    },

    ARDS: {
        ip: 'ardsliteservice.app.veery.cloud',
        port: 2225,
        version: '1.0.0.0'
    },

    NS: {
        ip: 'notificationservice.app.veery.cloud',
        port: 8089,
        version: '1.0.0.0'
    },

    Services : {
        interactionServiceHost: "interactions.app.veery.cloud",
        interactionServicePort: "3637",
        interactionServiceVersion: "1.0.0.0",
        dccaclientHost: "127.0.0.1",
        dccaclientPort: 4555,
        dccaclientVersion: "1.0.0.0"
    },

    WebAPI: {

        domain: '192.168.1.58',
        port: 80,
        path: '/CSReqWebApi/api/'
    },

    //Redis: {
    //    ip: '45.55.142.207',
    //    port: 6389,
    //    password: "DuoS123",
    //    db: 4
    //},

    "Redis":
    {
        "mode":"instance",//instance, cluster, sentinel
        "ip": "138.197.90.92",
        "port": 6389,
        "user": "duo",
        "password": "DuoS123",
        "db": 4,
        "sentinels":{
            "hosts": "138.197.90.92,45.55.205.92,162.243.81.39",
            "port":16389,
            "name":"redis-cluster"
        }

    },

    RabbitMQ: {
        "ip":"45.55.142.207",
        "port":"5672",
        "user": "admin",
        "password": "admin",
        "vhost":'/'
    },

    Mongo:
    {
        "ip":"104.236.231.11",
        "port":"27017",
        "dbname":"dvpdb",
        "password":"DuoS123",
        "user":"duo",
        "replicaset" :"104.236.231.11"
    },

    Token: "eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJpc3MiOiJzdWtpdGhhIiwianRpIjoiYWEzOGRmZWYtNDFhOC00MWUyLTgwMzktOTJjZTY0YjM4ZDFmIiwic3ViIjoiNTZhOWU3NTlmYjA3MTkwN2EwMDAwMDAxMjVkOWU4MGI1YzdjNGY5ODQ2NmY5MjExNzk2ZWJmNDMiLCJleHAiOjE5MDIzODExMTgsInRlbmFudCI6LTEsImNvbXBhbnkiOi0xLCJzY29wZSI6W3sicmVzb3VyY2UiOiJhbGwiLCJhY3Rpb25zIjoiYWxsIn1dLCJpYXQiOjE0NzAzODExMTh9.Gmlu00Uj66Fzts-w6qEwNUz46XYGzE8wHUhAJOFtiRo",
    billingEnabled: false,
    evtConsumeType: 'amqp',
    UseDashboardAMQP: 'false',
    EventPublishMethod: 'redis'
};