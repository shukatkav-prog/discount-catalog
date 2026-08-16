// config.js — усе, що можна захотіти покрутити руками, зібрано тут.

module.exports.EXCLUDE_KEYWORDS = [
  "мелен", "кава мел", // мелена кава (в т.ч. скорочено "кава мел.")
  "кава в зернах", "кава розчинна", "instant coffee", "coffee beans",
  "корм", "ласощі д/", "cat food", "dog food",
  // дитяче харчування й дитячі товари — за проханням Лери, не релевантно.
  "дитяч",
  // алкоголь: "напій" — надто загальне ключове слово для категорії "безалкогольні
  // напої", а українські виробники кріпких напоїв офіційно пишуть на етикетці
  // "напій алкогольний на основі рому/віскі тощо" — без цього списку горілка,
  // ром і подібне потрапляли б у категорію "Безалкогольні напої".
  "горілка", "коньяк", "віскі", "текіла", "бренді", "лікер", "мартіні", "вермут",
  "абсент", "самбука", "джин", "рому", "на основі рому", "на основі віскі",
  // побутова хімія й косметика: трапляються в акціях і випадково ловлять
  // харчові ключові слова через запах/смак у назві ("лимон", "фрукт" тощо),
  // напр. "Блок для унітазу ... лимон-океан", "Засіб д/мит.пос. ... лимон".
  // Просто "засіб" — бо в назвах миючих засобів це слово завжди скорочують
  // по-різному ("засіб для", "засіб д/") і в харчових товарах воно не трапляється.
  "засіб", "капсули для пмм", "капсули для пральн", "блок для унітазу",
  "маска для обличчя", "гель для душу", "шампунь", "кондиціонер для білизни",
];

// 20 категорій із запиту Лери + ключові слова, за якими товар туди потрапляє.
// Порядок важливий: перший збіг виграє.
module.exports.CATEGORIES = [
  { id: "cheese",   title: "Сири (преміальні, трюфель/спеції)",
    keywords: ["сир твердий","сир напівтверд","моцарел","фета","сулугун","чедер","бри ","камамбер","пармезан","гран моравія","gran moravia","ghidetti","spomlek","veldhuyzen","радомер","президент","крем-сир","плавлений сир","сирні палички","сир "] },
  { id: "oils",     title: "Оливки, олії, вершкове масло",
    keywords: ["олія оливков","olive oil","масло вершков","масло солодковершков","оливки","маслини"] },
  { id: "sausage",  title: "Ковбасні вироби (сиров'ялені, делікатеси)",
    keywords: ["ковбас","сосиск","сардель","бекон","шинка","балик","бутерброд ","салямі","джерк","прошутто","хамон","кабанос"],
    // "чипси/снеки зі смаком бекону" — це чипси, а не бекон. Товари, де м'ясне
    // слово насправді назва СМАКУ чогось іншого, підуть у "snacks" за
    // ключовим словом там (або лишаться за sourceCategory, якщо він відомий —
    // excludeKeywords діють лише коли sourceCategory невідома).
    excludeKeywords: ["чипс","снек","сухарик","крекер","попкорн","цукерк","печиво","морозиво",
      "яйц","приправ","гамбургер","бургер","ролліні","піца"] },
  { id: "fish",     title: "Риба та морепродукти",
    keywords: ["креветк","краб","рак","мідії","лосос","сьомг","форель","тунець","хек","кефаль","оселедець","сардин","тілапія","пангасіус","ікра","риба","скумбрі","дорадо"],
    excludeKeywords: ["чипс","снек","сухарик","крекер","попкорн","цукерк","печиво","морозиво",
      "яйц","приправ","гамбургер","бургер","ролліні","піца"] },
  { id: "poultry",  title: "Птиця (курка/качка для гриля)",
    keywords: ["курк","куряч","філе кур","крило","крильце","фарш кур","гомілк","індич","качин","качк","тушка"],
    excludeKeywords: ["чипс","снек","сухарик","крекер","попкорн","цукерк","печиво","морозиво",
      "яйц","приправ","гамбургер","бургер","ролліні","піца"] },
  { id: "vegan",    title: "Веганські продукти",
    keywords: ["веган","alpro","тофу","сейтан","хумус","бабагануш","рослинн"] },
  { id: "dairy",    title: "Молочні продукти (йогурти, безлактозне, сметана)",
    keywords: ["молоко","кефір","ряжанка","сметана","йогурт","сирок","сироч","actimel","творог","безлактоз"] },
  { id: "eggs",     title: "Яйця (С0, фермерські)",
    keywords: ["яйц","яйце","яйця"] },
  { id: "bread",    title: "Хліб та випічка",
    keywords: ["хліб","батон","багет","лаваш","тост","хачапурі","булоч","круасан","випічка"] },
  { id: "salads",   title: "Готові салати та зелень",
    keywords: ["салат","руккол","шпинат","зелен","айсберг","селера","буряк відвар","капуста квашен","вінегрет","мікс листов"] },
  { id: "produce",  title: "Свіжі овочі та фрукти",
    keywords: ["баклажан","морков","цибул","картопл","помідор","огірк","авокадо","ківі","цитрус","лимон","апельсин","мандарин","ягод","полуниц","овоч","фрукт"],
    // назви смаку/аромату (лимон, ягоди, фрукти...) масово трапляються в чаї,
    // напоях, чипсах, цукерках, соусах тощо — не даємо їм фальшиво потрапити
    // в "свіжі овочі та фрукти"; замість цього товар піде далі й знайде свою
    // справжню категорію нижче по списку (снеки/солодощі/напої/чай/морозиво...).
    excludeKeywords: ["чипс","снек","сухарик","соломк","чай","напій","пиво","соус",
      "приправ","мармелад","цукерк","желе","джем","смузі","деруни","биток",
      "зраз","пюре","кислота","трубочк","суміш","морозиво","вареник","нектар","каша"] },
  { id: "snacks",   title: "Снеки солоні (чипси, норі, насіння)",
    keywords: ["чипс","снек","попкорн","сухар","крекер","морська капуст","чука","норі","насіння","горіх","арахіс","мигдал","кеш'ю","кешью","сушен"] },
  { id: "sweets",   title: "Солодощі (желейні цукерки, протеїнові батончики)",
    keywords: ["цукерк","мармелад","драже","халва","батончик","тістечко","пиріг","печиво","рулет","маршмеллоу","желейн","шоколад","цукерки","торт"] },
  { id: "icecream", title: "Морозиво (Рудь та аналоги)",
    keywords: ["морозиво","пломбір","ескімо","mochi"] },
  { id: "drinks",   title: "Безалкогольні напої (комбуча, соки, лимонади)",
    keywords: ["сік","лимонад","вода мінерал","квас","тонік","холодний чай","напій","комбуч","нектар"] },
  { id: "nabeer",   title: "Пиво/сидр/вино безалкогольні",
    keywords: ["zero","0.0","light безалк"],
    // "безалкогольне пиво" як суцільна фраза майже ніколи не трапляється в
    // реальних назвах — там завжди є бренд між словами ("Пиво Bitburger Drive
    // світле безалкогольне"). Тому окремо — слова можуть бути будь-де в назві,
    // аби обидва були присутні.
    keywordGroups: [["пиво","безалкогольн"], ["сидр","безалкогольн"], ["вино","безалкогольн"]] },
  { id: "sauces",   title: "Приправи, соуси, пасти",
    keywords: ["соус","песто","майонез","приправ","паста nutella","кетчуп","каррі","хумус"] },
  { id: "pasta",    title: "Крупи, макарони, локшина (азійська)",
    keywords: ["макарони","локшина","круп","рис ","гречк","вівс","борошн","пластівці","часник гранул"] },
  { id: "frozen",   title: "Заморожені готові страви",
    keywords: ["пельмен","варен","піца","деруни","шашлик","боул","заморожен","бургер","гамбургер","ролліні"] },
  { id: "tea",      title: "Чай преміальний листовий",
    keywords: ["чай "] },
];

// Додаткові категорії — НЕ входять у 20 основних харчових категорій Лери, тому
// показуються окремою секцією нижче на сторінці (build.js), а не змішуються
// з основним списком. Перевіряються лише для товарів, що не підійшли під
// жодну з 20 основних — тобто ніколи не "відбирають" товар у основної категорії.
// Максимум 7 штук за домовленістю; тут — 4, бо саме стільки реальних великих
// кластерів знайшлось у даних (решта — розрізнений непродовольчий асортимент:
// декор, іграшки, канцтовари, батарейки тощо — свідомо викидається).
module.exports.EXTRA_CATEGORIES = [
  { id: "wine",     title: "Вино",
    keywords: ["вино","шампанське","просекко","prosecco","cava"] },
  { id: "regbeer",  title: "Пиво та сидр",
    keywords: ["пиво","сидр"] },
  { id: "clothing", title: "Одяг, взуття та аксесуари",
    keywords: ["колготк","шкарпетк","в'єтнамк","вєтнамк","рукавичк","капелюх","панам","кепк","шльопанц","сліди жіноч"] },
  { id: "homecare", title: "Догляд та побутова хімія",
    keywords: ["гель для пран","ополіскувач","капсули для пран","капсули д/пр","зубна паста",
      "паста зубна","прокладк","папір туалетн","пакети для сміт","мило рідке","губк",
      "порошок пральн","відбілювач","серветки волог","рушник паперов","зубна щітк",
      "щітка зубна","ватні палич","ватні диски"] },
];

module.exports.SOURCES = {
  silpo: {
    label: "Сільпо",
    // Playwright-рендер: ці сторінки сервер-рендеряться, і ціни видно навіть без взаємодії.
    // "expect" виставлено там, де сторінка на сайті Сільпо — однозначно ОДНА
    // категорія (не змішана) — build.js довіряє цьому більше за пошук по
    // ключових словах у назві товару. Сторінки знижок (cinotyzhyky) змішані —
    // expect не ставимо, категорія визначається лише за назвою.
    pages: [
      ...[1,2,3,4,5,6,7,8].map(p => `https://silpo.ua/offers/cinotyzhyky?page=${p}`),
      { url: "https://silpo.ua/category/olyvkova-oliia-4906", expect: "oils" },
      { url: "https://silpo.ua/category/bezalkogolne-pyvo-4484", expect: "nabeer" },
      { url: "https://silpo.ua/category/veganski-produkty-4866", expect: "vegan" },
      { url: "https://silpo.ua/category/chai-5126", expect: "tea" },
      { url: "https://silpo.ua/category/frukty-ovochi-4788", expect: "produce" },
      { url: "https://silpo.ua/category/zelen-i-salaty-4829", expect: "salads" },
      { url: "https://silpo.ua/category/m-iaso-ptytsi-4412", expect: "poultry" },
      { url: "https://silpo.ua/category/kachatyna-ta-gusiatyna-4428", expect: "poultry" },
      { url: "https://silpo.ua/category/syrov-ialena-syrokopchena-kovbasa-4738", expect: "sausage" },
      { url: "https://silpo.ua/category/kovbasni-vyroby-i-m-iasni-delikatesy-4731", expect: "sausage" },
      { url: "https://silpo.ua/category/tverdi-i-napivtverdi-syry-5008", expect: "cheese" },
      { url: "https://silpo.ua/category/sneky-ta-chypsy-5016", expect: "snacks" },
      { url: "https://silpo.ua/category/aziiska-lokshyna-4885", expect: "pasta" },
      { url: "https://silpo.ua/category/sousy-prypravy-4932", expect: "sauces" },
      "https://silpo.ua/category/gotovi-stravy-i-kulinariia-4761", // мішана (готові страви + кулінарія), без expect
      { url: "https://silpo.ua/category/kombucha-i-fermentovani-napoi-5109", expect: "drinks" },
      "https://silpo.ua/category/molochni-produkty-ta-iaitsia-234", // мішана (молочка + яйця), без expect
      { url: "https://silpo.ua/category/yogurty-245", expect: "dairy" },
    ],
    // Angular SSR, чіткі класи .product-card / .product-card__title / .product-card-price__*
    mode: "silpo",
  },
  atb: {
    label: "АТБ",
    pages: [
      ...[1,2,3,4,5].map(p => `https://www.atbmarket.com/promo/sale_tovari?page=${p}`),
      // звичайні (не лише акційні) сторінки категорій — потрібні, щоб мати ціну
      // товару в АТБ навіть коли він не на знижці цього тижня, для порівняння.
      // "expect" — тільки де сторінка магазину однозначно ОДНА категорія
      // (не мішана "м'ясо охолоджене" чи "нарізки та делікатеси", де може бути
      // що завгодно) — це і рятує, наприклад, чипси зі смаком курки від
      // потрапляння в "Птицю" лише через слово "курка" в назві.
      { url: "https://www.atbmarket.com/catalog/433-siri-tverdi", expect: "cheese" },
      { url: "https://www.atbmarket.com/catalog/402-siri-m-yaki", expect: "cheese" },
      { url: "https://www.atbmarket.com/catalog/439-siri-plavleni", expect: "cheese" },
      { url: "https://www.atbmarket.com/catalog/olia-ta-ocet", expect: "oils" },
      { url: "https://www.atbmarket.com/catalog/414-maslo-i-margarin", expect: "oils" },
      { url: "https://www.atbmarket.com/catalog/kovbasa", expect: "sausage" },
      { url: "https://www.atbmarket.com/catalog/377-sosiski-sardel-ki", expect: "sausage" },
      "https://www.atbmarket.com/catalog/narizki-ta-delikatesi", // мішана (м'ясо+сир нарізки), без expect
      { url: "https://www.atbmarket.com/catalog/riba", expect: "fish" },
      { url: "https://www.atbmarket.com/catalog/moreprodukti", expect: "fish" },
      "https://www.atbmarket.com/catalog/344-m-yaso-okholodzhene", // загальне м'ясо, не лише птиця — без expect
      { url: "https://www.atbmarket.com/catalog/398-moloko", expect: "dairy" },
      { url: "https://www.atbmarket.com/catalog/349-yogurti", expect: "dairy" },
      { url: "https://www.atbmarket.com/catalog/329-smetana", expect: "dairy" },
      { url: "https://www.atbmarket.com/catalog/379-sir-kislomolochniy", expect: "dairy" },
      { url: "https://www.atbmarket.com/catalog/381-yaytsya-kuryachi-perepelini", expect: "eggs" },
      { url: "https://www.atbmarket.com/catalog/331-khlib", expect: "bread" },
      { url: "https://www.atbmarket.com/catalog/397-lavash", expect: "bread" },
      { url: "https://www.atbmarket.com/catalog/468-solinnya-salati", expect: "salads" },
      { url: "https://www.atbmarket.com/catalog/287-ovochi-ta-frukti", expect: "produce" },
      { url: "https://www.atbmarket.com/catalog/390-zelen", expect: "produce" },
      { url: "https://www.atbmarket.com/catalog/cipsi-sneki", expect: "snacks" },
      { url: "https://www.atbmarket.com/catalog/409-krekeri", expect: "snacks" },
      { url: "https://www.atbmarket.com/catalog/446-gorikhi-sukhofrukti", expect: "snacks" },
      { url: "https://www.atbmarket.com/catalog/303-shokolad", expect: "sweets" },
      { url: "https://www.atbmarket.com/catalog/321-tsukerki", expect: "sweets" },
      { url: "https://www.atbmarket.com/catalog/351-torti-i-tistechka", expect: "sweets" },
      { url: "https://www.atbmarket.com/catalog/334-morozivo", expect: "icecream" },
      { url: "https://www.atbmarket.com/catalog/294-napoi-bezalkogol-ni", expect: "drinks" },
      { url: "https://www.atbmarket.com/catalog/324-soki-nektari", expect: "drinks" },
      { url: "https://www.atbmarket.com/catalog/mineralna-i-pitna-voda", expect: "drinks" },
      "https://www.atbmarket.com/catalog/310-pivo", // мішане пиво (алк.+безалк.), без expect
      { url: "https://www.atbmarket.com/catalog/365-sousi-ketchupi", expect: "sauces" },
      { url: "https://www.atbmarket.com/catalog/431-mayonez", expect: "sauces" },
      { url: "https://www.atbmarket.com/catalog/395-krupi", expect: "pasta" },
      { url: "https://www.atbmarket.com/catalog/348-makaronni-virobi", expect: "pasta" },
      { url: "https://www.atbmarket.com/catalog/322-zamorozheni-produkti", expect: "frozen" },
      { url: "https://www.atbmarket.com/catalog/356-vareniki-pel-meni-mlintsi", expect: "frozen" },
      { url: "https://www.atbmarket.com/catalog/318-chay", expect: "tea" },
    ],
    // article.catalog-item, ціни в атрибуті value на <data class="product-price__top/bottom">
    mode: "atb",
  },
  novus: {
    label: "Novus",
    pages: [
      ...Array.from({length: 20}, (_, i) => `https://novus.ua/sales.html?p=${i + 1}`),
      // novus.ua/sales.html показує лише акції. Регулярні ціни Novus живуть на
      // ІНШІЙ платформі — novus.zakaz.ua (React/Next, зовсім інша верстка,
      // тому окремий mode "novuszakaz" на ці сторінки, а не "novus").
      { url: "https://novus.zakaz.ua/uk/categories/cheese/", mode: "novuszakaz", expect: "cheese" },
      { url: "https://novus.zakaz.ua/uk/categories/cheese-snacks-novus/", mode: "novuszakaz", expect: "cheese" },
      { url: "https://novus.zakaz.ua/uk/categories/oil-and-vinegar-novus/", mode: "novuszakaz", expect: "oils" },
      { url: "https://novus.zakaz.ua/uk/categories/butter/", mode: "novuszakaz", expect: "oils" },
      { url: "https://novus.zakaz.ua/uk/categories/sausages-and-burgers/", mode: "novuszakaz", expect: "sausage" },
      { url: "https://novus.zakaz.ua/uk/categories/sausages-and-frankfurters-novus/", mode: "novuszakaz", expect: "sausage" },
      { url: "https://novus.zakaz.ua/uk/categories/delicatessen-novus/", mode: "novuszakaz", expect: "sausage" },
      { url: "https://novus.zakaz.ua/uk/categories/fish-and-seafood-novus/", mode: "novuszakaz", expect: "fish" },
      { url: "https://novus.zakaz.ua/uk/categories/canned-fish/", mode: "novuszakaz", expect: "fish" },
      { url: "https://novus.zakaz.ua/uk/categories/fresh-meat/", mode: "novuszakaz" }, // загальне м'ясо, не лише птиця
      { url: "https://novus.zakaz.ua/uk/categories/meat-and-paultry/", mode: "novuszakaz" }, // мішана (м'ясо+птиця)
      { url: "https://novus.zakaz.ua/uk/categories/vegan-sausages-novus/", mode: "novuszakaz", expect: "vegan" },
      { url: "https://novus.zakaz.ua/uk/categories/tofu-and-meat-alternatives/", mode: "novuszakaz", expect: "vegan" },
      { url: "https://novus.zakaz.ua/uk/categories/milk/", mode: "novuszakaz", expect: "dairy" },
      { url: "https://novus.zakaz.ua/uk/categories/yogurt/", mode: "novuszakaz", expect: "dairy" },
      { url: "https://novus.zakaz.ua/uk/categories/sour-cream/", mode: "novuszakaz", expect: "dairy" },
      { url: "https://novus.zakaz.ua/uk/categories/curd/", mode: "novuszakaz", expect: "dairy" },
      { url: "https://novus.zakaz.ua/uk/categories/milk-drinks/", mode: "novuszakaz", expect: "dairy" },
      { url: "https://novus.zakaz.ua/uk/categories/dairy-free-food-and-drinks/", mode: "novuszakaz", expect: "dairy" },
      { url: "https://novus.zakaz.ua/uk/categories/eggs/", mode: "novuszakaz", expect: "eggs" },
      { url: "https://novus.zakaz.ua/uk/categories/bakery-products-novus/", mode: "novuszakaz", expect: "bread" },
      { url: "https://novus.zakaz.ua/uk/categories/wheat-bread-and-shortcake/", mode: "novuszakaz", expect: "bread" },
      { url: "https://novus.zakaz.ua/uk/categories/crisp-bread/", mode: "novuszakaz", expect: "bread" },
      { url: "https://novus.zakaz.ua/uk/categories/salads-and-pickles/", mode: "novuszakaz", expect: "salads" },
      { url: "https://novus.zakaz.ua/uk/categories/vegetables/", mode: "novuszakaz", expect: "produce" },
      { url: "https://novus.zakaz.ua/uk/categories/fruits/", mode: "novuszakaz", expect: "produce" },
      { url: "https://novus.zakaz.ua/uk/categories/fresh-greens/", mode: "novuszakaz", expect: "produce" },
      { url: "https://novus.zakaz.ua/uk/categories/mushrooms/", mode: "novuszakaz", expect: "produce" },
      { url: "https://novus.zakaz.ua/uk/categories/chips/", mode: "novuszakaz", expect: "snacks" },
      { url: "https://novus.zakaz.ua/uk/categories/nori-novus/", mode: "novuszakaz", expect: "snacks" },
      { url: "https://novus.zakaz.ua/uk/categories/seeds/", mode: "novuszakaz", expect: "snacks" },
      { url: "https://novus.zakaz.ua/uk/categories/saltine-rusks/", mode: "novuszakaz", expect: "snacks" },
      { url: "https://novus.zakaz.ua/uk/categories/popcorn/", mode: "novuszakaz", expect: "snacks" },
      { url: "https://novus.zakaz.ua/uk/categories/cookies/", mode: "novuszakaz", expect: "sweets" },
      { url: "https://novus.zakaz.ua/uk/categories/candies-and-chocolate-bars/", mode: "novuszakaz", expect: "sweets" },
      { url: "https://novus.zakaz.ua/uk/categories/block-chocolate/", mode: "novuszakaz", expect: "sweets" },
      { url: "https://novus.zakaz.ua/uk/categories/pastries-and-cakes/", mode: "novuszakaz", expect: "sweets" },
      { url: "https://novus.zakaz.ua/uk/categories/waffle/", mode: "novuszakaz", expect: "sweets" },
      { url: "https://novus.zakaz.ua/uk/categories/marshmallow-and-gumdrop/", mode: "novuszakaz", expect: "sweets" },
      { url: "https://novus.zakaz.ua/uk/categories/eastern-sweetnesses/", mode: "novuszakaz", expect: "sweets" },
      { url: "https://novus.zakaz.ua/uk/categories/icecream/", mode: "novuszakaz", expect: "icecream" },
      { url: "https://novus.zakaz.ua/uk/categories/juices-and-nectars-novus/", mode: "novuszakaz", expect: "drinks" },
      { url: "https://novus.zakaz.ua/uk/categories/mineral-water/", mode: "novuszakaz", expect: "drinks" },
      { url: "https://novus.zakaz.ua/uk/categories/soft-drinks/", mode: "novuszakaz", expect: "drinks" },
      { url: "https://novus.zakaz.ua/uk/categories/kvass/", mode: "novuszakaz", expect: "drinks" },
      { url: "https://novus.zakaz.ua/uk/categories/kombucha-novus/", mode: "novuszakaz", expect: "drinks" },
      { url: "https://novus.zakaz.ua/uk/categories/ice-tea/", mode: "novuszakaz", expect: "drinks" },
      { url: "https://novus.zakaz.ua/uk/categories/sauce/", mode: "novuszakaz", expect: "sauces" },
      { url: "https://novus.zakaz.ua/uk/categories/mayonnaise-mayonnaise-sauces-novus/", mode: "novuszakaz", expect: "sauces" },
      { url: "https://novus.zakaz.ua/uk/categories/ketchup/", mode: "novuszakaz", expect: "sauces" },
      { url: "https://novus.zakaz.ua/uk/categories/herbs-and-spices/", mode: "novuszakaz", expect: "sauces" },
      { url: "https://novus.zakaz.ua/uk/categories/pulses-and-grain/", mode: "novuszakaz", expect: "pasta" },
      { url: "https://novus.zakaz.ua/uk/categories/pasta/", mode: "novuszakaz", expect: "pasta" },
      { url: "https://novus.zakaz.ua/uk/categories/flour/", mode: "novuszakaz", expect: "pasta" },
      { url: "https://novus.zakaz.ua/uk/categories/porridge-and-muesli/", mode: "novuszakaz", expect: "pasta" },
      { url: "https://novus.zakaz.ua/uk/categories/half-made-food/", mode: "novuszakaz", expect: "frozen" },
      { url: "https://novus.zakaz.ua/uk/categories/frozen-vegetables/", mode: "novuszakaz", expect: "frozen" },
      { url: "https://novus.zakaz.ua/uk/categories/dough/", mode: "novuszakaz", expect: "frozen" },
      { url: "https://novus.zakaz.ua/uk/categories/tea/", mode: "novuszakaz", expect: "tea" },
    ],
    // Magento: li.product-item, data-price-type=finalPrice/oldPrice
    mode: "novus",
  },
  fora: {
    label: "Фора",
    // SPA, але сторінки пагінуються звичайним query-параметром ?to=N&from=N (перевірено
    // живим запуском), картки — .product-list-item / .product-title / .current-integer.
    pages: [
      "https://fora.ua/all-offers",
      ...Array.from({length: 19}, (_, i) => `https://fora.ua/all-offers?to=${i + 2}&from=${i + 2}`),
      // звичайні (не лише акційні) категорії — переважно батьківські "ВСЕ У ..."
      // сторінки: живим тестуванням з'ясовано, що вони стабільно повертають повний
      // список товарів, тоді як частина вузьких підкатегорій (напр. syry-tverdi-3636)
      // подеколи віддає 0 результатів (схоже на баг самого сайту, не наш).
      // "expect" — лише де сторінка магазину однозначно ОДНА категорія.
      "https://fora.ua/category/kovbasy-ta-syry-2738", // мішана (ковбаси+сири)
      { url: "https://fora.ua/category/oliia-2494", expect: "oils" },
      "https://fora.ua/category/m-iaso-ta-ryba-2699", // мішана (м'ясо+риба)
      { url: "https://fora.ua/category/prygotovlena-ryba-ta-moreprodukty-2701", expect: "fish" },
      "https://fora.ua/category/molochni-produkty-ta-iaitsia-2656", // мішана (молочка+яйця)
      { url: "https://fora.ua/category/kyslomolochna-produktsiia-2658", expect: "dairy" },
      { url: "https://fora.ua/category/moloko-vershky-2659", expect: "dairy" },
      { url: "https://fora.ua/category/yaitsia-2942", expect: "eggs" },
      { url: "https://fora.ua/category/khlib-ta-vypichka-2902", expect: "bread" },
      { url: "https://fora.ua/category/salat-2795", expect: "salads" },
      { url: "https://fora.ua/category/frukty-ovochi-ta-solinnia-2790", expect: "produce" },
      { url: "https://fora.ua/category/sneky-2730", expect: "snacks" },
      { url: "https://fora.ua/category/291solodoshchi-2913", expect: "sweets" },
      { url: "https://fora.ua/category/morozyvo-2687", expect: "icecream" },
      { url: "https://fora.ua/category/soky-ta-bezalkogolni-napoi-2479", expect: "drinks" },
      "https://fora.ua/category/pyvo-2465", // мішане пиво (алк.+безалк.)
      { url: "https://fora.ua/category/bezalkogolne-vyno-2466", expect: "nabeer" },
      "https://fora.ua/category/sydr-2469", // переважно звичайний (алкогольний) сидр
      "https://fora.ua/category/bakaliia-konservy-ta-sousy-2492", // надто широка (бакалія+консерви+соуси)
      { url: "https://fora.ua/category/krupy-2495", expect: "pasta" },
      { url: "https://fora.ua/category/zamorozhena-produktsiia-2686", expect: "frozen" },
      "https://fora.ua/category/kava-chai-2775", // мішана (кава+чай)
    ],
    mode: "fora",
  },
};
