import { Database } from '../db/Database';
import { Transaction } from '../db/Transaction';

export type TransOrDB = Transaction | Database;
