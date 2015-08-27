/**
 * Created by Heshan Indika on 8/07/2015.
 */



module.exports = function(sequelize, DataTypes) {
    var ArdsRequestMetadata = sequelize.define('ARDS_RequestMetadata', {

            Tenant: {type:DataTypes.INTEGER,unique: 'RequestMetadataIndex'},
            Company: {type:DataTypes.INTEGER,unique: 'RequestMetadataIndex'},
            Class: {type:DataTypes.STRING,unique: 'RequestMetadataIndex'},
            Type: {type:DataTypes.STRING,unique: 'RequestMetadataIndex'},
            Category:{type:DataTypes.STRING,unique: 'RequestMetadataIndex'},
            ServingAlgo: DataTypes.STRING,
            HandlingAlgo: DataTypes.STRING,
            SelectionAlgo: DataTypes.STRING,
            ReqHandlingAlgo: DataTypes.STRING,
            ReqSelectionAlgo: DataTypes.STRING,
            MaxReservedTime: DataTypes.INTEGER,
            MaxRejectCount: DataTypes.INTEGER,
            RequestMetadataId:{type:DataTypes.INTEGER, primaryKey:true,autoIncrement: true}

        }
    );
    return ArdsRequestMetadata;
};
