const mongoose = require('mongoose');

const schema = mongoose.Schema;
const postSchema = new schema({
    title: {
        type: String,
        require: true
    },
    markdownbody: {
        type: String,
        required: true
    },
    createdAt: {
        type: Date,
        default: Date.now
    },
    modifiedAt: {
        type: Date,
        default: Date.now
    },
    desc:{
        type: String
    },
    author:{
        type: String,
        require: true
    },
    tags: {
        type: String,
        required: true
    },
    thumbnailImageURI: {
        type: String,
        required: true
    },
    lastUpdateAuthor: {
        type: String,
        required: true
    },
    body: {
        type: String,
        required: true
    },
    isApproved:{
        type: Boolean,
        default: false,
        required: true
    }

});

postSchema.index({
    title: 'text',
    body: 'text',
    tags: 'text',
    author: 'text',
    isApproved: 1,
    createdAt: -1
  });

module.exports = mongoose.model('Posts', postSchema);