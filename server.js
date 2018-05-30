require('dotenv').load();

const express     = require('express');
const MongoClient = require('mongodb').MongoClient;
const app         = express();
const searchDate  = '2017-09-30';
const request     = require('request');

var requestsQuery = [];
var requests = 0;
var maxRequests = 5;

//app.listen(process.env.PORT, () => {
//    console.log('Working on ' + process.env.PORT);
//});
//
//app.get('/', (req, res) => {
//    res.send('Working here');
//});

MongoClient.connect(process.env.DB_URL, { useNewUrlParser: true }, async (err, dbConn) => {
    if (err) return console.log(err);
    let db = dbConn.db("test-node");
    await importDb(db);
    
    let d = new Date(searchDate);
    let d2 = new Date(searchDate);
    d2.setDate(d.getDate()+1);
    
    let filter = {
        createdAt:{
            '$gt': d,
            '$lt': d2
        }
    };
    
    let result = await db.collection('notes').find(filter).toArray();
    
    if(result.length === 0) {
        return false;
    }
    
    await (function(){
        return new Promise(function(resolve) {
            for(let i in result) {
                let item = result[i];
                if(!item.text || !(/^Номер заказа/).test(item.text)) {
                    continue;
                }

                let n = item.text.substr(13);
                if(n.substr(0, 2) !== '79') {
                    db.collection('notes').updateOne({_id: item._id}, {$set:{error: 'Pattern not found'}});
                    continue;
                }
                
                if(!item.data || !item.data.url) {
                    db.collection('notes').updateOne({_id: item._id}, {$set:{error: 'No url for item set'}});
                    continue;
                }
                //make queue
                if(requests >= maxRequests) {
                    requestsQuery.push(item);
                    continue;
                }
                requests++;
                makeRequest(db, item, resolve);
            }
        });
    })();
    
    let result2 = await db.collection('notes').find({}).toArray();
    console.log('Final result:');
    console.log(result2);
    dbConn.close();
});

function makeRequest(db, item, resolve) {
    request(item.data.url, {
        headers: {
            'Content-Type': 'application/json'
        },
        json: true
    }, (err, response, body) => {
        if(response && response.statusCode == 200) {
            db.collection('notes').updateOne({_id: item._id}, {$set:{response: body}});
        } else {
            db.collection('notes').updateOne({_id: item._id}, {$set:{error: 'Invalid response'}});
        }
        
        console.log('+++++');
        console.log(item.data.url + ' completed!');
        
        if(requestsQuery.length !== 0) {
            let item = requestsQuery.splice(0, 1);
            makeRequest(db, item[0], resolve);
        } else {
            requests--;
            if(requests === 0) {
                resolve();
            }
        }
    });
}

async function importDb(db) {
    var data = require('./data.json');
    if(!data || data.length === 0) {
        return false;
    }
    await db.collection('notes').deleteMany({});
    
    for(var i in data) {
        data[i].createdAt = new Date(data[i].createdAt);
        await db.collection('notes').insertOne(data[i]);
    }
    return true;
}