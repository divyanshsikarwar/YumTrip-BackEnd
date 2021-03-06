const express = require("express");
const PORT = process.env.PORT || 5000;
const cors = require("cors");
const app = express();
var server = require("http").createServer(app);
var formidable = require("formidable");
var crypto = require("crypto");
const hp = require("./ServerFiles/HelperFunctions");
const Mailing = require("./ServerFiles/Mail");
console.log(process.env.REACT_APP_AWS_SECRETKEY);
server.listen(PORT, function () {
  var host = server.address().address;
  var port = server.address().port;
  console.log("App listening at http://%s:%s", host, port);
});

app.use(express.json());
app.use(
  cors({
    origin: "*",
    methods: ["GET", "POST"],
  })
);

const io = require("socket.io")(5001, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
});
io.on("connection", (socket) => {
  socket.on("Join", (roomid) => {
    socket.join(roomid);
  });
  socket.on("NewOrder", (roomid) => {
    io.to(roomid).emit("Notify", "");
  });
  socket.on("connect_error", (err) => {
    console.log(`connect_error due to ${err.message}`);
  });
});



const mongoose = require("mongoose");
const { SSL_OP_DONT_INSERT_EMPTY_FRAGMENTS } = require("constants");
mongoose.connect(
  process.env.DBKEY
);

var db = mongoose.connection;
db.on("error", console.log.bind(console, "connection error"));
db.once("open", function (callback) {
  console.log("connection succeeded");
});

function crypt(p1) {
  var crypto = require("crypto");
  return p1 == "rest"
    ? crypto.randomBytes(2).toString("hex") +
        "-" +
        crypto.randomBytes(2).toString("hex") +
        "-" +
        crypto.randomBytes(2).toString("hex")
    : crypto.randomBytes(3).toString("hex");
}

app.post("/check", async function (req, res) {
  var obj = req.body;

  var xx = await db
    .collection("Store Credentials")
    .find({ email: obj.email })
    .count();
  if (xx > 0) {
    res.json({
      ans: false,
    });
  } else {
    res.json({
      ans: true,
    });
  }
});

app.post("/adminsignup", async function (req, res) {
  var obj = req.body;
  console.log("Insert 1");
  returnedData = hp.insert(obj);
  console.log("Insert 2");
  db.collection("Store Credentials").insertOne(returnedData[0]);
  db.collection("UserMenu").insertOne(returnedData[1]);
  db.collection("Admin").insertOne(returnedData[2]);
  db.collection("Items").insertOne(returnedData[3]);
  db.collection("Orders").insertOne(returnedData[4]);
  res.json({
    bool: true,
  });
});

app.post("/adminsignin", async function (req, res) {
  var obj = req.body;
  var sess = crypto.randomBytes(16).toString("hex");
  var xx = await db
    .collection("Store Credentials")
    .findOne({ email: obj.email, password: obj.password });

  if (xx) {
    res.json({
      bool: true,
      session: sess,
      key: xx.key,
    });
  } else {
    res.json({
      bool: false,
      session: "",
      key: "",
    });
    return;
  }

  var yy = await db.collection("Sessions").findOne({ key: xx.key });
  if (yy) {
    db.collection("Sessions").updateOne(
      { key: xx.key },
      {
        $set: { sessionid: sess, time: hp.currtime() },
      }
    );
  } else {
    db.collection("Sessions").insertOne({
      sessionid: sess,
      time: hp.currtime(),
      key: xx.key,
    });
  }
});

app.post("/GetItemsForUser", async function (req, res) {
  var obj = req.body;
  var xx = await db.collection("Items").findOne({ key: obj.key });
  var yy = await db.collection("Admin").findOne({ key: obj.key });

  if (xx) {
    res.json({
      bool: true,
      name: yy.name,
      logo: yy.logo,
      address: yy.address,
      city: yy.city,
      items: xx.itmes,
    });
  } else {
    res.json({ bool: false });
  }
});

async function validatesessions(sess) {
  if (!sess || sess.length !== 32) {
    return false;
  }
  var xx = await db.collection("Sessions").findOne({ sessionid: sess });
  currentTime = hp.currtime();
  if (!xx || currentTime - xx.time > 1800000) {
    return false;
  }
  return xx;
}

async function updateSessionTime(sess) {
  db.collection("Sessions").updateOne(
    { sessionid: sess },
    {
      $set: { time: hp.currtime() },
    }
  );
}

app.post("/LoginCheck", async function (req, res) {
  var obj = req.body;
  const sessdetails = await validatesessions(obj.session);
  if (sessdetails == false) {
    res.json({
      bool: false,
    });
  } else {
    res.json({
      bool: true,
      key: sessdetails.key,
    });
  }
});

app.post("/GetItemsForMenuManager", async function (req, res) {
  var obj = req.body;
  const sessdetails = await validatesessions(obj.session);
  if (sessdetails == false) {
    res.json({
      bool: false,
    });
    return;
  }
  var xx = await db.collection("Items").findOne({ key: sessdetails.key });
  if (xx) {
    res.json({
      bool: true,
      key: xx.key,
      name: "Pizza Hut",
      image: "images/123.png",
      logo: "images/123-logo.png",
      items: xx.itmes,
    });
  } else {
    res.json({ bool: false });
  }
  updateSessionTime(obj.session);
});

app.post("/adminItemEdit", async function (req, res) {
  var obj = req.body;
  const sessdetails = await validatesessions(obj.session);
  if (sessdetails == false) {
    res.json({ bool: false });
    return false;
  }

  if (obj.type == "availability") {
    var xx = await db.collection("Items").findOne({ key: sessdetails.key });
    itemlist = xx.itmes;

    for (let i = 0; i < itemlist.length; i++) {
      if (itemlist[i].Itemkey == obj.itemkey) {
        itemlist[i].available = obj.change;
        break;
      }
    }
    db.collection("Items").updateOne(
      { key: sessdetails.key },
      {
        $set: { itmes: itemlist },
      }
    );
    res.json({ bool: true });
  } else if (obj.type == "addition") {
    var xx = await db.collection("Items").findOne({ key: sessdetails.key });
    itemlist = xx.itmes;
    itemlist.push({
      Itemkey: crypt("dish"),
      name: obj.name,
      price: obj.price,
      available: obj.available,
    });
    db.collection("Items").updateOne(
      { key: sessdetails.key },
      {
        $set: { itmes: itemlist },
      }
    );
    res.json({ bool: true });
  } else if (obj.type == "edit") {
    var xx = await db.collection("Items").findOne({ key: sessdetails.key });
    itemlist = xx.itmes;
    for (let i = 0; i < itemlist.length; i++) {
      if (itemlist[i].Itemkey == obj.itemkey) {
        itemlist[i].name = obj.name;
        itemlist[i].price = obj.price;
        itemlist[i].available = obj.available;
        break;
      }
    }
    db.collection("Items").updateOne(
      { key: sessdetails.key },
      {
        $set: { itmes: itemlist },
      }
    );
    res.json({ bool: true });
  } else if (obj.type == "delete") {
    var xx = await db.collection("Items").findOne({ key: sessdetails.key });
    itemlist = xx.itmes;
    for (let i = 0; i < itemlist.length; i++) {
      if (itemlist[i].Itemkey == obj.itemkey) {
        itemlist.splice(i, 1);
        break;
      }
    }
    db.collection("Items").updateOne(
      { key: sessdetails.key },
      {
        $set: { itmes: itemlist },
      }
    );
    res.json({ bool: true });
  }
  updateSessionTime(obj.session);
});

app.post("/neworder", async function (req, res) {
  var obj = req.body;
  let mailDetails = [];
  let InvoiceString = crypto.randomBytes(6).toString("hex");
  let Orderlist = await db.collection("Orders").findOne({ key: obj.key });
  if (Orderlist) {
    Updatedlist = Orderlist.Orders;
    mailDetails.push(Orderlist.totalOrders + 1);
    Updatedlist.push({
      time: hp.formatAMPM(new Date()),
      date: hp.todaysdate(),
      invoice: InvoiceString,
      orderno: Orderlist.totalOrders + 1,
      name: obj.name,
      email: obj.email,
      ph: obj.ph,
      items: obj.items,
      cost: obj.cost,
      tableno: obj.tableno,
      active: true,
      completed: false,
    });

    db.collection("Orders").updateOne(
      { key: obj.key },
      {
        $set: { totalOrders: Orderlist.totalOrders + 1, Orders: Updatedlist },
      }
    );
  } else {
    let Orderlist = [];
    mailDetails.push(1);
    Orderlist.push({
      time: hp.formatAMPM(new Date()),
      date: hp.todaysdate(),
      invoice: InvoiceString,
      orderno: 1,
      name: obj.name,
      email: obj.email,
      ph: obj.ph,
      items: obj.items,
      cost: obj.cost,
      tableno: obj.tableno,
      active: true,
      completed: false,
    });

    db.collection("Orders").insertOne({
      key: obj.key,
      totalOrders: 1,
      Orders: Orderlist,
      inactiveOrders: [],
    });
  }

  mailDetails.push(obj.items);
  mailDetails.push((obj.cost * 8) / 100 + obj.cost);
  let yy = await db.collection("Admin").findOne({ key: obj.key });
  mailDetails.push(yy.address);
  mailDetails.push(yy.city);
  mailDetails.push(yy.phno);
  mailDetails.push(obj.name);
  mailDetails.push(InvoiceString + ":" + obj.key);
  Mailing.OrderConfirmationMail(obj.email, mailDetails);
  Mailing.OrderRecieveMail(yy.email, [
    obj.items,
    obj.cost,
    InvoiceString + ":" + obj.key,
  ]);
});

app.post("/GetActiveOrders", async function (req, res) {
  var obj = req.body;
  const sessdetails = await validatesessions(obj.session);
  if (sessdetails == false) {
    res.json({
      bool: false,
    });
    return;
  }
  var xx = await db.collection("Orders").findOne({ key: sessdetails.key });
  var yy = await db.collection("Admin").findOne({ key: sessdetails.key });
  if (obj.type == "All") {
    res.json({
      restname: yy.name,
      restaddress: yy.address,
      restcity: yy.city,
      restlogo: yy.logo,
      items: [].concat(xx.Orders, xx.inactiveOrders),
    });
    return;
  }
  res.json({
    items: xx.Orders,
    restname: yy.name,
    restaddress: yy.address,
    restcity: yy.city,
    restlogo: yy.logo,
  });
  updateSessionTime(obj.session);
});

app.post("/UpdateOrders", async function (req, res) {
  var obj = req.body;
  const sessdetails = await validatesessions(obj.session);
  if (sessdetails == false) {
    res.json({
      bool: false,
    });
    return;
  }
  var xx = await db.collection("Orders").findOne({ key: sessdetails.key });
  var orderlist = xx.Orders;

  var inactiveorderlist = xx.inactiveOrders;
  for (let i = 0; i < orderlist.length; i++) {
    if (orderlist[i].orderno === obj.orderno) {
      if (obj.type === "Complete") {
        orderlist[i].completed = true;
      }
      if (obj.type === "Cancel") {
        Mailing.OrderCancelledMail(orderlist[i].email, [
          orderlist[i].items,
          orderlist[i].cost,
          orderlist[i].orderno,
          orderlist[i].invoice + ":" + obj.key,
        ]);
      }
      orderlist[i].active = false;
      inactiveorderlist.push(orderlist[i]);
      orderlist.splice(i, 1);
      break;
    }
  }
  db.collection("Orders").updateOne(
    { key: sessdetails.key },
    {
      $set: { Orders: orderlist, inactiveOrders: inactiveorderlist },
    }
  );
  res.json({
    bool: true,
  });
  updateSessionTime(obj.session);
});

app.post("/GetDasboardData", async function (req, res) {
  var obj = req.body;
  const sessdetails = await validatesessions(obj.session);
  if (sessdetails == false) {
    res.json({
      bool: false,
    });
    return;
  }

  var xx = await db.collection("Orders").findOne({ key: sessdetails.key });
  let allOrders = [].concat(xx.Orders, xx.inactiveOrders);
  let returningData = [];
  let Revenue = 0;
  let todaysOrders = 0;
  for (let i = 0; i < allOrders.length; i++) {
    Revenue += allOrders[i].cost;
    if (allOrders[i].date == hp.todaysdate()) {
      todaysOrders += 1;
    }
  }
  returningData.push(Revenue);
  returningData.push(todaysOrders);
  returningData.push(xx.Orders.length);
  var MenuItems = await db
    .collection("Items")
    .findOne({ key: sessdetails.key });
  returningData.push(MenuItems.itmes.length);
  allOrders.sort(function (m, n) {
    return m.orderno - n.orderno;
  });

  if (allOrders.length <= 5) {
    returningData.push(allOrders.reverse());
  } else {
    returningData.push(allOrders.reverse().slice(0, 5));
  }
  returningData.push(hp.last7days([].concat(xx.Orders, xx.inactiveOrders)));
  res.json({
    ret: returningData,
  });
  updateSessionTime(obj.session);
});

app.post("/GetQRDetails", async function (req, res) {
  var obj = req.body;
  const sessdetails = await validatesessions(obj.session);
  if (sessdetails == false) {
    res.json({
      bool: false,
    });
    return;
  }
  var xx = await db.collection("Admin").findOne({ key: sessdetails.key });
  res.json({
    name: xx.name,
    logo: xx.logo,
    key: sessdetails.key,
  });
});

app.post("/sendActivationMail", async function (req, res) {
  var obj = req.body;
  var currTime = hp.currtime();
  var xx = await db.collection("Verification").findOne({ email: obj.email });
  if (xx) {
    if (currTime - xx.time > 3600000) {
      code = crypto.randomBytes(3).toString("hex");
      Mailing.ActivationMail(obj.email, code);
      db.collection("Verification").updateOne(
        { email: obj.email },
        {
          $set: { code: code, time: currTime },
        }
      );
    } else {
      Mailing.ActivationMail(obj.email, xx.code);
    }
  } else {
    code = crypto.randomBytes(3).toString("hex");
    Mailing.ActivationMail(obj.email, code);
    db.collection("Verification").insertOne({
      email: obj.email,
      code: code,
      time: currTime,
    });
  }
});

app.post("/verifyActivationCode", async function (req, res) {
  var obj = req.body;
  var currTime = hp.currtime();
  var xx = await db.collection("Verification").findOne({ email: obj.email });

  if (currTime - xx.time > 3600000) {
    code = crypto.randomBytes(3).toString("hex");
    Mailing.ActivationMail(obj.email, code);
    db.collection("Verification").updateOne(
      { email: obj.email },
      {
        $set: { code: code, time: currTime },
      }
    );
    res.json({
      bool: false,
      expire: true,
    });
  } else {
    if (xx.code === obj.code) {
      res.json({
        bool: true,
        expire: false,
      });
    } else {
      res.json({
        bool: false,
        expire: false,
      });
    }
  }
});

app.post("/getSearchData", async function (req, res) {
  var obj = req.body;
  /*  cursor = await db.collection("Admin").find({ image: "" }); */

  db.collection("Admin")
    .find({ image: "" })
    .toArray(function (err, result) {
      var ret = [];
      for (let i = 0; i < result.length; i++) {
        ret.push({
          name: result[i].name,
          city: result[i].city,
          link: "https://yumtrip.netlify.app/#/store/" + result[i].key,
        });
      }
      res.json({
        data: ret,
      });
    });
});

app.post("/invoice", async function (req, res) {
  var obj = req.body;
  var invoiceString = obj.id;
  var xx = await db.collection("Orders").findOne({ key: obj.key });
  if (!xx) {
    res.json({
      bool: false,
    });
    return;
  }
  let allOrders = [].concat(xx.Orders, xx.inactiveOrders);
  for (let i = 0; i < allOrders.length; i++) {
    if (allOrders[i].invoice == invoiceString) {
      var yy = await db.collection("Admin").findOne({ key: obj.key });
      res.json({
        bool: true,
        order: allOrders[i].items,
        restname: yy.name,
        restaddress: yy.address,
        restcity: yy.city,
        restlogo: yy.logo,
      });
      return;
    }
  }
  res.json({
    bool: false,
  });
});
