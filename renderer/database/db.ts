import Dexie from 'dexie';
import Accounts, {AccountsTable} from './accounts';
import MyAccounts, {MyAccountsTable} from './my_accounts';
import Hashtags, {HashtagsTable} from './hashtags';
import Statuses, {StatusesTable} from './statuses';
import HashtagCompletionHistory from './hashtag_completion_history';

// Note:
// Simply notify tables' type information to TypeScript compiler
// https://github.com/dfahlander/Dexie.js/wiki/Typescript#create-a-subclass
interface TypedDexie extends Dexie {
    readonly accounts: AccountsTable;
    readonly my_accounts: MyAccountsTable;
    readonly hashtags: HashtagsTable;
    readonly statuses: StatusesTable;
}

export class Database {
    db: TypedDexie;
    accounts: Accounts;
    my_accounts: MyAccounts;
    hashtags: Hashtags;
    statuses: Statuses;
    hashtag_completion_history: HashtagCompletionHistory;

    constructor () {
        this.db = new Dexie('YourFukurou') as TypedDexie;
        this.db.version(1).stores({
            accounts: Accounts.getScheme(1)!,
            my_accounts: MyAccounts.getScheme(1)!,
            hashtags: Hashtags.getScheme(1)!,
            statuses: Statuses.getScheme(1)!,
        });

        this.accounts = new Accounts(this.db.accounts);
        this.my_accounts = new MyAccounts(this.db.my_accounts);
        this.hashtags = new Hashtags(this.db.hashtags);
        this.statuses = new Statuses(this.db.statuses);
        this.hashtag_completion_history = new HashtagCompletionHistory();
    }
}

export default new Database();
