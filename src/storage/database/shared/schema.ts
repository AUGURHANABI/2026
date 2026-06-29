import { pgTable, serial, varchar, text, timestamp, integer, boolean, index } from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"

// 系统表（禁止删除）
export const healthCheck = pgTable("health_check", {
	id: serial().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow(),
});

// 企业/组织
export const enterprises = pgTable(
	"enterprises",
	{
		id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
		name: varchar("name", { length: 100 }).notNull(),
		invite_code: varchar("invite_code", { length: 8 }).notNull().unique(),
		owner_id: varchar("owner_id", { length: 36 }).notNull(),
		created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
		updated_at: timestamp("updated_at", { withTimezone: true }),
	},
	(table) => [
		index("enterprises_invite_code_idx").on(table.invite_code),
		index("enterprises_owner_id_idx").on(table.owner_id),
	]
);

// 企业成员
export const enterpriseMembers = pgTable(
	"enterprise_members",
	{
		id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
		enterprise_id: varchar("enterprise_id", { length: 36 }).notNull().references(() => enterprises.id, { onDelete: "cascade" }),
		user_id: varchar("user_id", { length: 36 }).notNull(),
		role: varchar("role", { length: 20 }).default("member").notNull(), // owner, admin, member
		joined_at: timestamp("joined_at", { withTimezone: true }).defaultNow().notNull(),
	},
	(table) => [
		index("enterprise_members_enterprise_id_idx").on(table.enterprise_id),
		index("enterprise_members_user_id_idx").on(table.user_id),
	]
);

// 话术分类
export const categories = pgTable(
	"categories",
	{
		id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
		enterprise_id: varchar("enterprise_id", { length: 36 }).references(() => enterprises.id),
		name: varchar("name", { length: 100 }).notNull(),
		description: text("description"),
		sort_order: integer("sort_order").default(0).notNull(),
		created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
		updated_at: timestamp("updated_at", { withTimezone: true }),
	},
	(table) => [
		index("categories_sort_order_idx").on(table.sort_order),
		index("categories_enterprise_id_idx").on(table.enterprise_id),
	]
);

// 标签
export const tags = pgTable(
	"tags",
	{
		id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
		enterprise_id: varchar("enterprise_id", { length: 36 }).references(() => enterprises.id),
		name: varchar("name", { length: 50 }).notNull(),
		color: varchar("color", { length: 20 }).default("#0891b2"),
		created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
	},
	(table) => [
		index("tags_name_idx").on(table.name),
		index("tags_enterprise_id_idx").on(table.enterprise_id),
	]
);

// 知识库条目
export const knowledgeEntries = pgTable(
	"knowledge_entries",
	{
		id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
		enterprise_id: varchar("enterprise_id", { length: 36 }).references(() => enterprises.id),
		question: text("question").notNull(),
		answer: text("answer").notNull(),
		category_id: varchar("category_id", { length: 36 }).references(() => categories.id),
		is_active: boolean("is_active").default(true).notNull(),
		usage_count: integer("usage_count").default(0).notNull(),
		effectiveness_score: integer("effectiveness_score").default(0),
		current_version: integer("current_version").default(1).notNull(),
		created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
		updated_at: timestamp("updated_at", { withTimezone: true }),
	},
	(table) => [
		index("knowledge_entries_category_id_idx").on(table.category_id),
		index("knowledge_entries_is_active_idx").on(table.is_active),
		index("knowledge_entries_usage_count_idx").on(table.usage_count),
		index("knowledge_entries_created_at_idx").on(table.created_at),
		index("knowledge_entries_enterprise_id_idx").on(table.enterprise_id),
	]
);

// 知识库条目与标签的多对多关系
export const knowledgeEntryTags = pgTable(
	"knowledge_entry_tags",
	{
		id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
		entry_id: varchar("entry_id", { length: 36 }).notNull().references(() => knowledgeEntries.id, { onDelete: "cascade" }),
		tag_id: varchar("tag_id", { length: 36 }).notNull().references(() => tags.id, { onDelete: "cascade" }),
		created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
	},
	(table) => [
		index("knowledge_entry_tags_entry_id_idx").on(table.entry_id),
		index("knowledge_entry_tags_tag_id_idx").on(table.tag_id),
	]
);

// 条目版本历史
export const entryVersions = pgTable(
	"entry_versions",
	{
		id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
		entry_id: varchar("entry_id", { length: 36 }).notNull().references(() => knowledgeEntries.id, { onDelete: "cascade" }),
		version: integer("version").notNull(),
		question: text("question").notNull(),
		answer: text("answer").notNull(),
		change_note: text("change_note"),
		created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
	},
	(table) => [
		index("entry_versions_entry_id_idx").on(table.entry_id),
		index("entry_versions_version_idx").on(table.version),
	]
);

// 条目评论
export const entryComments = pgTable(
	"entry_comments",
	{
		id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
		entry_id: varchar("entry_id", { length: 36 }).notNull().references(() => knowledgeEntries.id, { onDelete: "cascade" }),
		author: varchar("author", { length: 50 }).default("匿名用户"),
		content: text("content").notNull(),
		is_merged: boolean("is_merged").default(false).notNull(),
		created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
	},
	(table) => [
		index("entry_comments_entry_id_idx").on(table.entry_id),
		index("entry_comments_created_at_idx").on(table.created_at),
	]
);

// 问答历史记录
export const qaHistory = pgTable(
	"qa_history",
	{
		id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
		enterprise_id: varchar("enterprise_id", { length: 36 }).references(() => enterprises.id),
		question: text("question").notNull(),
		answer: text("answer").notNull(),
		matched_entry_id: varchar("matched_entry_id", { length: 36 }).references(() => knowledgeEntries.id),
		is_ai_generated: boolean("is_ai_generated").default(false).notNull(),
		effectiveness_rating: integer("effectiveness_rating"),
		created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
	},
	(table) => [
		index("qa_history_created_at_idx").on(table.created_at),
		index("qa_history_matched_entry_id_idx").on(table.matched_entry_id),
		index("qa_history_is_ai_generated_idx").on(table.is_ai_generated),
		index("qa_history_enterprise_id_idx").on(table.enterprise_id),
	]
);
