#!/usr/bin/env node
require('dotenv').config();
const mongoose = require('mongoose');

async function fixTitles() {
  try {
    console.log('🔗 Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI);

    const db = mongoose.connection.db;
    const posts = db.collection('posts');

    console.log('📋 Fetching all posts...');
    const allPosts = await posts.find({}).toArray();
    console.log(`✅ Found ${allPosts.length} posts\n`);

    const titleFields = ['title', 'title_en', 'title_sq', 'title_pt', 'title_es', 'title_fr', 'title_de', 'metaTitle'];

    let updated = 0;
    for (const post of allPosts) {
      const updates = {};
      let hasChanges = false;

      titleFields.forEach((field) => {
        const current = post[field];
        if (current && typeof current === 'string') {
          const normalized = current.trim();
          if (normalized !== current) {
            updates[field] = normalized;
            hasChanges = true;
          }
        }
      });

      if (hasChanges) {
        await posts.updateOne({ _id: post._id }, { $set: updates });
        updated++;
        console.log(`✅ Post "${post.title}" updated`);
      }
    }

    console.log(`\n📊 Summary: ${updated} posts updated`);
    await mongoose.connection.close();
    process.exit(0);
  } catch (err) {
    console.error('❌ Error:', err.message);
    process.exit(1);
  }
}

fixTitles();
