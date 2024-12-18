const mongoose = require("mongoose");

const albumSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
    },
    description: {
      type: String,
    },
    ownerId: {
      type: String,
      required: true,
    },
    sharedUsers: [{ type: String }],
  },
  { timestamps: true }
);

const Album = mongoose.model("Album", albumSchema);

module.exports = Album;
