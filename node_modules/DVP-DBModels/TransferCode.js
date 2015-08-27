module.exports = function(sequelize, DataTypes) {
    var TransferCode = sequelize.define('CSDB_TransferCode', {
            InternalTransfer: DataTypes.INTEGER,
            ExternalTransfer: DataTypes.INTEGER,
            GroupTransfer: DataTypes.INTEGER,
            ConferenceTransfer: DataTypes.INTEGER,
            CompanyId: DataTypes.INTEGER,
            TenantId: DataTypes.INTEGER,
            ObjClass: DataTypes.STRING,
            ObjType: DataTypes.STRING,
            ObjCategory: DataTypes.STRING
        }
    );


    return TransferCode;
};