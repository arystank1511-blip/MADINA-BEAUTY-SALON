import { createApp } from './app';
void createApp().then((app) => app.listen(Number(process.env.PORT || 3000), '0.0.0.0'));
