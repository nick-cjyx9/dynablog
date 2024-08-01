import { relations, sql } from 'drizzle-orm'
import type { AnySQLiteColumn } from 'drizzle-orm/sqlite-core'
import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'

export const blog = sqliteTable('blog', {
  title: text('title'),
  id: integer('id').primaryKey().notNull(),
  postLink: text('postLink').notNull().unique(),
  likes: text('likes').default('').notNull(),
  aiSummary: text('ai_summary'),
})

// TODO: instead this by auth.js
export const user = sqliteTable('users', {
  email: text('email').primaryKey().notNull().unique(),
  nickName: text('nickName'),
  personalWebsite: text('personalWebsite'),
})

export const comment = sqliteTable('comment', {
  id: integer('id').primaryKey({ autoIncrement: true }).notNull().unique(),
  commentPool: integer('commentPool'),
  parent: integer('parent').references((): AnySQLiteColumn => comment.id),
  user: text('user').references(() => user.email),
  isVisitor: integer('isVisitor', { mode: 'boolean' }).notNull(),
  visitorIp: text('visitorIp'),
  // if isVisitor, visitorIp is needed
  value: text('value').notNull(),
  createdAt: integer('createdAt').notNull().default(sql`(current_timestamp)`),
  likes: text('likes').default(''),
})

export const blogRelations = relations(blog, ({ many }) => ({
  comments: many(comment),
}))

export const commentRelation = relations(comment, ({ one }) => ({
  parentPost: one(blog, { fields: [comment.commentPool], references: [blog.id] }),
}))

export type Blog = typeof blog.$inferSelect
export type User = typeof user.$inferSelect
export type Comment = typeof comment.$inferSelect
