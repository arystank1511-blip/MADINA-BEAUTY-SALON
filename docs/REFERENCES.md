# Референсы и ресурсы

## Сценарии и архитектура

- https://github.com/mauricioromagnollo/go-barber
- https://github.com/michu2k/nestjs-booking-system
- https://github.com/LowellLim/appointment-system

Репозитории изучены как ориентиры; исходный код из них не переносился. Реализация написана под техническое задание FORMA.

Визуальное направление: https://neovision.dev/about и текстовые требования пользователя. Упомянутые в задании пять скриншотов отсутствовали во вложениях этой задачи. Их точное сопоставление невозможно. Использованы заданные признаки: почти чёрный фон, оранжевый акцент, крупная типографика, четверть страницы под подпись раздела, тонкая сетка, прямоугольные действия, точечные ленты. Название, контент и контакты Neo Vision не копировались.

## Изображения

- `team.png`: синтетические портреты трёх вымышленных мастеров, созданы инструментом OpenAI image generation специально для проекта. Один общий файл показывается с разным object-position; исходное изображение не обрезалось и не ретушировалось. На сайте обозначен демонстрационный характер команды.
- `interior.jpg`: Kawê Rodrigues, Unsplash: https://unsplash.com/photos/a-man-cutting-another-mans-hair-in-a-salon-JsiH9gv73n0. Источник изображения: https://images.unsplash.com/photo-1703792686658-24e62d626ed2. Условия: https://unsplash.com/license. Это иллюстрация салона, не фотография действующей FORMA.
- Manrope Variable: пакет @fontsource-variable/manrope, OFL-1.1, локальные WOFF2 с font-display: swap. Lucide icons: ISC. Зависимости сохраняют собственные лицензии.
- Точечная графика hero/footer/404: собственный SVG pattern и mask, без WebGL и DOM-частиц.

## Технические источники

- https://www.postgresql.org/docs/current/rangetypes.html — диапазоны и EXCLUDE.
- https://docs.nestjs.com/ — NestJS.
- https://www.prisma.io/docs/orm/prisma-client/queries/transactions — транзакции Prisma.
