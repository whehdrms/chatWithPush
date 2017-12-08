var express = require('express');
var colors = require('colors');
var { mongoose } = require('./db/mongoose');
var { Chat } = require('./models/Chat');
var Expo = require('exponent-server-sdk');
var expo = new Expo();
var app = express();
var server = require('http').Server(app);
var io = require('socket.io')(server);
server.listen(8080);
console.log('Server is running at 80');

//Chat.remove({}).then((e)=>{console.log(e)});

app.use((req,res)=>{
  res.send('<h1>Heeham</h1>');
});

var rooms = [];


io.on('connection', function (socket) {
  console.log('Socket Connected'.green, socket.id);


  socket.on('enterRoom', (user, chatDays, pushToken)=>{
    for (let day in chatDays) {
      if (chatDays[day] != null) {
        var foundRoom;

        foundRoom = rooms.find((room)=>{ return room.roomName == chatDays[day] })
	if (!foundRoom) {
          rooms.push({
            roomName: chatDays[day],
            day: day,
            pushTokens: new Set().add(pushToken),
            msgCount: 0
          });
        } else {
          foundRoom.pushTokens.has(pushToken) || foundRoom.pushTokens.add(pushToken);
        }

        socket.join(chatDays[day]);
        console.log(`${user}가 ${chatDays[day]}에 입장했습니다. 요일 : ${day}`);

        Chat.find({to: chatDays[day]}).then((messages) => {
          // 해당 요일 및 요일의 메세지들을 전달해주어 초기화
          socket.emit('initial', day, messages);
        }, (e) => {
          socket.emit('initial', day, []);
        });
      }
    }
  });

  socket.on('newMsg', async (msg, count) => {
    // 기존 메세지 카운트와 유저가 보낸 카운트를 비교
    var _room = rooms.find((room)=>{ return room.roomName == msg.to });
    var mcnt = _room.msgCount;
    var _day = _room.day;

    console.log('메세지 카운트 : ', mcnt);
    console.log('유저가 제공한 카운트 : ', count);
    if (mcnt != count) {
      if (mcnt > count) {
        // 카운트가 서로 다르면, 즉 유저가 가진 데이터량보다 실제로 더 많이 저장되 어 있으면 그 만큼만 다시 초기화
        Chat.find({to: msg.to}).limit(mcnt - count).sort({_id: -1})
        .then((messages)=>{
          // 차이나는 만큼 바로 전송해준다.
          socket.emit('initial', _day, messages.reverse());

          var newChat = new Chat({
            from: msg.from,
            to: msg.to,
            body: msg.body,
		pushToken: msg.pushToken,
            createdAt: msg.createdAt
          });
          newChat.save().then((doc)=>{
            console.log(doc);
            _room.msgCount += 1;
            io.to(doc.to).emit('initial', _day, [doc]);
          }, (e) => {
            socket.emit('dbErr', doc);
          });

        });
        console.log(`Pollyfill 실행 : ${mcnt - count}개`.magenta);
      } else {
        console.log('유저가 가진 메세지가 서버가 가진 메세지보다 많습니다.'.red);
   // 추가한 부분
   _room.msgCount = count
      }
    } else {
      console.log('바로 전달'.cyan);
      // 최신 상태.
      // 받은 메세지를 저장하고 바로 뿌려준다.
      var newChat = new Chat({
        from: msg.from,
        to: msg.to,
        body: msg.body,
	pushToken: msg.pushToken,
        createdAt: msg.createdAt
      });

      newChat.save().then((doc)=>{
        console.log(doc);
        _room.msgCount += 1;
        io.to(doc.to).emit('initial', _day, [doc]);
      }, (e) => {
        socket.emit('dbErr', doc);
      });
    }

   // send push notification
      try {
        let receipts = await expo.sendPushNotificationsAsync(Array.from(_room.pushTokens).filter((x) => x!=msg.pushToken).map(function(val) {
        //console.log(val);  
        return {
            // The push token for the app user to whom you want to send the notification
            // to: 토큰명
            // to: 'ExponentPushToken[OT4xXrG15AThMFGijxtTnc]',
            to: val,

            // 수신 시 소리
            sound: null,

            priority : 'high',

            // 앱에 뜨는 숫자
            badge: 2,

            // 푸쉬알림의 제목이라고 한다.
            title: '[런치팅]',
            body: '메세지가 도착했습니다. 어서 확인해보세요!',
            // 앱에 푸쉬알림과 함께 보낼 데이터, 이를 통해 사후 처리를 할 수 있다.
            data: {withSome: '키키'},
          };
        }));
        console.log(receipts);
      } catch (error) {
        console.error(error);
      }

  });

//WEB
  socket.on('joinRoom', (user, room, day) => {

    if (rooms.find((room)=>{ return room.roomName == room }) == undefined) {
      rooms.push({roomName: room, day: day, msgCount: 0});
    }

    socket.join(room);
    console.log(`${user}가 ${room}에 입장했습니다. 요일 : ${day}`);

    Chat.find({to: room}).then((messages) => {
      socket.emit('initial', day, messages);
    }, (e) => {
      socket.emit('initial', day, []);
    });
  });

  socket.on('disconnect',()=>{
    console.log('Socket Disconnected'.red, socket.id);
  });

});


// Refer below codes for Push Notification.
// Must include var Expo = require('exponent-server-sdk');
// To Use Expo Library
// // To check if something is a push token
// let isPushToken = Expo.isExponentPushToken("ExponentPushToken[OT4xXrG15AThMFGijxtTnc]");
// console.log("유효토큰 여부: ", isPushToken);
// // Create a new Expo SDK client
// let expo = new Expo();

// To send push notifications -- note that there is a limit on the number of
// notifications you can send at once, use expo.chunkPushNotifications()
// let chunks = expo.chunkPushNotifications(messages);
//
// (async () => {
//   // Send the chunks to the Expo push notification service. There are
//   // different strategies you could use. A simple one is to send one chunk at a
//   // time, which nicely spreads the load out over time:
//   for (let chunk of chunks) {
//     try {
//       let receipts = await expo.sendPushNotificationsAsync(chunk);
//       console.log(receipts);
//     } catch (error) {
//       console.error(error);
//     }
//   }
// })();

//
//
//
//
// app.use(bodyParser.json());
//
// POST 라우팅 설정
// app.post('/chats', (req, res) => {
//   var newChat = new Chat({
//     text: req.body.text
//   });
//   newChat.save().then((doc)=>{
//     res.send(doc);
//   }, (e) => {
//     res.status(400).send(e);
//   });
// });
//
// app.post('/getchats', (req, res) => {
//   Chat.find().then((chats) => {
//     res.send({chats});
//   }, (e) => {
//     res.status(400).send(e);
//   });
// });
//
//
// app.listen(3000, ()=>{
//   console.log('Started Server. Listening on 3000 :'.green.underline);
// })
