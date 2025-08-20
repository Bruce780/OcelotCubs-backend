const express = require('express');
const router = express.Router();
const path = require('path');
const Game = require(path.join(__dirname, '../model/Game.js'));


router.get('/', async (req, res) => {
  const search = req.query.search || '';
  const regex = new RegExp(search, 'i');
  const games = await Game.find({ title: { $regex: regex } });
  res.json(games);
});

router.post('/', async (req, res) => {

  console.log('Received:', req.body); 
  
  const game = new Game(req.body);
  await game.save();
  res.status(201).json(game);
});

module.exports = router;
