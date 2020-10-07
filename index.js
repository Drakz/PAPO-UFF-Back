var proxy = require('express-http-proxy');
const express = require('express');
const cors = require('cors');
const mysql = require('mysql');
var jwt = require('jsonwebtoken');
const app = express();

const connection = mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: '',
    database: 'TCC'
});

connection.connect(err => {
    if(err){    
        return err;
    }
});

app.use(cors({
    origin: 'http://localhost:3000',
    methods: ['POST', 'PUT', 'GET', 'OPTIONS', 'HEAD'],
    credentials: true
  }));

app.use('/*', proxy(`localhost:3000`, {
    filter: req => !req.baseUrl.startsWith("/api"),
    proxyReqPathResolver: req => req.baseUrl
}));

app.use(express.json());

app.post('/api/login',(req, res) =>{
    connection.query(`SELECT nome FROM user WHERE username = "${req.body.loginName}" AND password = "${req.body.password}"`, (err, rows, fields) =>{
        if(err){
            res.status(500).send()
        }
        if(rows[0] === undefined){
            res.status(401).send()
        }
        const token = jwt.sign({expirationDate: Date.now() + 1000000},"a")
        res.cookie("authCookie",token, {path: '/', expires: new Date(Date.now() + 9000000), httpOnly: true});
        console.log(rows[0].nome)
        res.redirect(307,'/professor')
        //res.status(200).send()
    });
});

app.listen(4000, () => {
    console.log(`Listening...`)
});