const mongoose = require('mongoose');

const gameSchema = new mongoose.Schema({
  title: { type: String, required: true },
  description: String,
  genre: String,
  image: String,         
  downloadLink: String  
});

module.exports = mongoose.model('Game', gameSchema);
