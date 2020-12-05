const express = require("express")
const expressLayouts = require("express-ejs-layouts")
const session = require('express-session')
const app = express()
const fetch = require("node-fetch")
const bcrypt = require('bcrypt')
const connection = require("./dbPool.js")

const IP = process.env.IP || "0.0.0.0"
const PORT = process.env.PORT || 5000

// express setup
app.set("view engine", "ejs");
app.use(express.static("public"))
app.use(expressLayouts)

app.use(express.urlencoded({extended: true}))
app.use(session({
    secret: process.env.SECRET || 'top-secret',
    resave: true,
    saveUninitialized: true
}))

// middleware function
function isAuthenticatedJson(req, res, next) {
    if (!req.session.authenticated) {
        req.redirect("/")
    }
    next()
}

function isAuthenticatedJson(req, res, next) {
    if (!req.session.authenticated) {
        return req.status(400).json({
            success: false,
            message: "You must be authenticated to perform this action."
        })
    }
    next()
}


// routes
app.get("/", async function (req, res) {
    // homepage
    var viewData = {}
    res.render("index", viewData)
})
app.get("/ebook", async function (req, res) {
    // ebook index page; browse books
    var viewData = {}
    res.render("ebook-index", viewData)
})
app.get("/ebook/:ebook_id", async function (req, res) {
    // ebook page; show detail for single ebook
    var viewData = {}
    res.render("ebook-show", viewData)
})
app.get("/api/ebook", async function (req, res) {
    // return a list of ebooks available
    connection.query(
        "SELECT * FROM ebook",
        function (error, rows, fields) {
            if (error) {
                return res.status(500).json({
                    success: false,
                    message: "Unexpected server error.",
                    error: error
                })
            }

            return res.status(200).json({
                success: true,
                message: "Found ebooks.",
                data: {
                    ebooks: rows
                }
            })
        }
    )
})
app.get("/api/ebook/:ebook_id", async function (req, res) {
    // return single ebook detail
    connection.query(
        "SELECT * FROM ebook WHERE id=?",
        [req.query.ebook_id],
        function (error, rows, fields) {
            if (error) {
                return res.status(500).json({
                    success: false,
                    message: "Unexpected server error.",
                    error: error
                })
            }

            if (rows.length == 1) {
                return res.status(200).json({
                    success: true,
                    message: "Ebook found.",
                    data: {
                        ebook: rows[0]
                    }
                })
            } else {
                return res.status(404).json({
                    success: false,
                    message: "Ebook not found."
                })
            }

        }
    )
})
app.post("/api/ebook/:ebook_id/checkout", isAuthenticatedJson, async function (req, res) {
    // user checks out a book -- requires authentication
    connection.query(
        "INSERT INTO borrow (user_id, ebook_id, due) VALUES (?, ?, NOW() + INTERVAL 21 DAY)",
        [req.session.userId, req.query.ebook_id],
        function(error, rows, fields) {
            if (error) {
                return res.status(500).json({
                    success: false,
                    message: "Unexpected server error.",
                    error: error
                })
            }

            res.status(200).json({
                success: true,
                message: "Successfully checked out ebook.",
                data: {
                    borrow_id: rows[0].id
                }
            })
        }
    )
})
app.get("/login", async function (req, res) {
    // login page
    var viewData = {}
    res.render("login", viewData)
})
app.post("/api/login", async function (req, res) {
    // login api call
    if (req.session.authenticated && req.session.username == req.body.username) {
        // already logged in
        res.status().json({
            success: true,
            message: "Successfully logged in.",
            data: {
                username: req.session.username
            }
        })
    } else {
        // new login, reset
        req.session.authenticated = false
        delete req.session.username
        delete req.session.userId
    }

    let username = req.body.username
    let plaintextPassword = req.body.password

    connection.query(
        "SELECT * FROM user WHERE username=?",
        [username],
        function(error, rows, fields) {
            if (error) {
                return res.status(500).json({
                    success: false,
                    message: "Unexpected server error.",
                    error: error
                })
            }

            if (rows.length != 1) {
                // user not found
                res.status(401).json({
                    success: false,
                    message: "Username and password combination not valid."
                })
            }

            let row = rows[0]

            let validPassword  = await bcrypt.compare(plaintextPassword, row.password_hash)

            if (validPassword) {
                req.session.authenticated = true
                req.session.username = row.username
                req.session.userId = row.id
    
                res.status(200).json({
                    success: true,
                    message: "Successfully logged in.",
                    data: {
                        username: row.username
                    }
                })
            } else {
                res.status(401).json({
                    success: false,
                    message: "Username and password combination not valid."
                })
            }
        }
    )
})
app.post("/api/logout", isAuthenticatedJson, async function (req, res) {
    req.session.authenticated = false
    delete req.session.username
    delete req.session.userId

    return res.status(200).json({
        success: true,
        message: "Successfully logged out."
    })
})
app.get("/user", async function (req, res) {
    // user management page; 
    var viewData = {}
    res.render("user-index", viewData)
})
app.get("/user/ebook", async function (req, res) {
    // user borrowed ebooks index; show list of borrowed books 
    var viewData = {}
    res.render("user-ebook-index", viewData)
})
app.get("/user/ebook/:borrow_id", async function (req, res) {
    // user borrowed ebook; display ebook to user in browser
    var viewData = {}
    res.render("user-ebook-show", viewData)
})
app.get("/api/user/ebook", isAuthenticatedJson, async function (req, res) {
    // list of user borrowed ebooks -- requires authentication
    connection.query(
        `SELECT e.*, b.id AS borrow_id
        FROM borrow b
            INNER JOIN ebook e ON b.ebook_id=e.id
        WHERE b.user_id = ?`,
        [req.session.userId],
        function(error, rows, fields) {
            if (error) {
                return res.status(500).json({
                    success: false,
                    message: "Unexpected server error.",
                    error: error
                })
            }

            res.status(200).json({
                success: true,
                message: "Successfully fetched checked out ebooks.",
                data: {
                    ebooks: rows
                }
            })
        }
    )
})
app.post("/api/user/ebook/:borrow_id/return", isAuthenticatedJson, async function (req, res) {
    // return user borrowed ebook -- requires authentication
    connection.query(
        "DELETE FROM borrow WHERE user_id=? AND id=?",
        [req.session.userId, req.query.borrow_id],
        function(error, rows, fields) {
            if (error) {
                return res.status(500).json({
                    success: false,
                    message: "Unexpected server error.",
                    error: error
                })
            }

            res.status(200).json({
                success: true,
                message: "Successfully returned checked out ebook.",
            })
        }
    )
})

// starting server
app.listen(PORT, IP, function () {
    console.log(`Express server is running at http://${IP}:${PORT}`)
})