import * as Express from 'express';

const app = Express();

app.get("/foo", (req: Express.Request, res: Express.Response) => res.json({"json": "brown"}));

app.listen(process.env.PORT || 4000);