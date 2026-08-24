CREATE TABLE `companies` (
	`id` int AUTO_INCREMENT NOT NULL,
	`ownerCredentialId` int NOT NULL,
	`name` varchar(220) NOT NULL,
	`crNumber` varchar(80) NOT NULL,
	`logoUrl` text,
	`letterheadUrl` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `companies_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `local_credentials` (
	`id` int AUTO_INCREMENT NOT NULL,
	`username` varchar(80) NOT NULL,
	`passwordHash` text NOT NULL,
	`displayName` varchar(160) NOT NULL,
	`role` enum('admin','manager','viewer') NOT NULL DEFAULT 'admin',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `local_credentials_id` PRIMARY KEY(`id`),
	CONSTRAINT `local_credentials_username_unique` UNIQUE(`username`)
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` int AUTO_INCREMENT NOT NULL,
	`openId` varchar(64) NOT NULL,
	`name` text,
	`email` varchar(320),
	`loginMethod` varchar(64),
	`role` enum('user','admin') NOT NULL DEFAULT 'user',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`lastSignedIn` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `users_id` PRIMARY KEY(`id`),
	CONSTRAINT `users_openId_unique` UNIQUE(`openId`)
);
