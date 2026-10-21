// Every UI string, Ukrainian (default) and English. Keys are flat; `{name}` is a placeholder and
// `{n, plural, one {…} few {…} many {…} other {…}}` picks the plural form. test/i18n.test.ts checks that both
// languages have the same keys and placeholders and that components carry no literal Cyrillic. Legal quotes, rule
// labels and obligation texts are data (data/), not UI strings.
// Adapted from vlk-engine (apps/demo/src/web/i18n/dict.ts), Apache-2.0, same author: the same flat dictionary and
// plural syntax; the messages are new.

const uk = {
  "app.title": "Навігатор регуляторики медвиробів",
  "app.lede":
    "Опишіть програмне забезпечення, і побачите, чи це медвиріб у ЄС, якого він класу й що з цього випливає. Кожен висновок спирається на дослівну цитату.",
  "banner.lead": "Демо, не юридична консультація.",
  "banner.rest":
    "Клас визначає виробник; для IIa і вище його підтверджує нотифікований орган. Правила — чернетка, не перевірені регуляторним фахівцем.",

  "market.legend": "Ринок",
  "market.EU": "ЄС",
  "market.US": "США",
  "view.legend": "Подання",
  "view.map": "Мапа",
  "view.checklist": "Чекліст",
  "lang.legend": "Мова інтерфейсу",
  "lang.uk": "Укр",
  "lang.en": "Eng",
  "asOf.label": "Станом на",
  "asOf.today": "Сьогодні",
  "asOf.todayMark": "Сьогодні, {date}",
  "asOf.tick":
    "{date}: {n, plural, one {# вимога набирає чинності} few {# вимоги набирають чинності} many {# вимог набирають чинності} other {# вимоги набирають чинності}}",
  "asOf.prev": "Попередня ключова дата",
  "asOf.next": "Наступна ключова дата",
  "proposals.label": "Проєкти змін",
  "proposals.none": "Проєктів змін у даних поки немає",
  "proposals.on": "Червоним: як змінився б результат, якби проєкт ухвалили",

  "device.heading": "Опис ПЗ",
  "device.custom": "Ваше ПЗ",
  "device.modified": "{name} (змінено)",
  "preset.label": "Приклад із настанов",
  "preset.none": "Без прикладу",
  "device.clear": "Очистити відповіді",
  "group.qualification": "Чи це медвиріб",
  "group.classification": "Клас",
  "group.ai": "AI",
  "group.market": "Ринок",
  "group.guidance": "Для перехресної перевірки",
  "chip.yes": "так",
  "chip.no": "ні",
  "chip.unknown": "не знаю",
  "chip.text": "{label}: {value}",
  "chip.aria": "{label}: {value}. Змінити відповідь",
  "chips.rest.show": "Показати решту ({n})",
  "chips.rest.hide": "Сховати решту",
  "chips.rest.hint": "Ці відповіді зараз нічого не змінюють",
  "editor.close": "Готово",
  "editor.concept": "Поняття в джерелі",
  "answer.legend": "Відповідь",
  "answer.yes": "Так",
  "answer.no": "Ні",
  "answer.unknown": "Не знаю",

  "map.label": "Мапа вимог для цього ПЗ",
  "branch.class": "Клас",
  "branch.market": "Шлях на ринок",
  "branch.qms": "Система якості",
  "branch.clinical": "Клінічні докази",
  "branch.cyber": "Кібербезпека й дані",
  "branch.ai": "AI",
  "branch.count": "{n, plural, one {# вимога} few {# вимоги} many {# вимог} other {# вимоги}}",
  "branch.open":
    "{n, plural, one {# залежить від відповіді} few {# залежать від відповіді} many {# залежать від відповіді} other {# залежить від відповіді}}",
  "branch.from": "з {date}",
  "branch.none": "нічого не застосовується",
  "branch.decides": "Що вирішить:",
  "branch.more": "і ще {n}",
  "branch.answer": "Відповісти",
  "leaf.open": "залежить від відповіді",
  "leaf.from": "з {date}",
  "leaf.until": "до {date}",
  "leaf.optional": "бракує відповідей для перевірки",
  "leaf.either": "{a} або {b}",

  "ladder.heading": "Клас",
  "ladder.why": "Чому клас {value}",
  "ladder.oneOf": "Один із: {list}",
  "ladder.maybeNone": "Може й не бути медвиробом",
  "ladder.none": "Класу немає: правила класифікації не застосовуються",
  "ladder.aria.value": "Клас {value}. Відкрити пояснення",
  "ladder.aria.possible": "Можливі класи: {list}. Відкрити пояснення",
  "ladder.aria.none": "Класу немає. Відкрити пояснення",
  "ladder.proposal": "За проєктом: {list}",
  "qual.oneOf": "Одне з: {list}",
  "qual.open": "Ще невідомо, чи це медвиріб",
  "device.openCount":
    "Залежить від {n, plural, one {# відповіді} few {# відповідей} many {# відповідей} other {# відповіді}}",

  "card.label": "Пояснення",
  "card.close": "Закрити",
  "card.how": "Як виконати",
  "card.requirement": "Вимога",
  "card.deliverable": "Документ або доказ",
  "card.standards": "Стандарти",
  "card.standards.none": "Окремого стандарту немає",
  "card.who": "Хто",
  "card.when": "З якої дати",
  "card.basis": "Правова основа",
  "card.guidance": "Що каже настанова",
  "card.dateBasis": "Звідки дата",
  "card.dependsOn": "Залежить від",
  "applies.true": "Застосовується до цього ПЗ",
  "applies.null": "Залежить від відповіді",
  "applies.false": "Не застосовується до цього ПЗ",
  "timing.in-force": "чинне з {date}",
  "timing.upcoming": "застосовуватиметься з {date}",
  "timing.expired": "діяло до {date}",
  "standard.edition": "редакція {edition}",
  "standard.catalogue": "Сторінка в каталозі",
  "standard.metadata": "Текст стандарту не відтворено: лише номер, редакція й призначення.",

  "rule.result": "Результат",
  "rule.decided": "Що вирішило",
  "rule.stricter": "Чому не суворіше",
  "rule.questions": "Що вирішить",
  "rule.notApplicable": "Не застосовується",
  "rule.draft": "Правило — чернетка (ревізія {revision}), не перевірене фахівцем.",
  "rule.from": "Застосовується з {date}",
  "rule.upcoming": "Ще не застосовується: з {date}",
  "rule.hypothetical": "Проєкт, не чинне право",
  "node.true": "так",
  "node.false": "ні",
  "node.null": "невідомо",
  "cross.consistent": "Узгоджується з відповідями: {actual}",
  "cross.inconsistent": "Не узгоджується: перевірка дає {actual}, а відповіді вказують на {expected}",
  "cross.incomplete": "Для перевірки бракує відповідей",
  "cross.questions": "Відповіді для перевірки",

  "proposal.leaf": "за проєктом: {what}",
  "proposal.decides": "Що вирішить за проєктом:",
  "proposal.state.none": "не застосовувалося б",
  "proposal.state.open": "залежало б від відповіді",
  "proposal.state.in-force": "застосовувалося б",
  "proposal.state.upcoming": "застосовувалося б з {date}",
  "proposal.state.expired": "уже не застосовувалося б",
  "proposal.branch":
    "{n, plural, one {проєкт змінює # пункт} few {проєкт змінює # пункти} many {проєкт змінює # пунктів} other {проєкт змінює # пункту}}",
  "proposal.heading": "Якби проєкт ухвалили",
  "proposal.title": "{title}: проєкт, не чинне право.",
  "proposal.questions": "Що ще потрібно знати проєкту",
  "proposal.changes": "Що змінилося б у вимогах",
  "proposal.changes.none": "Вимоги до цього ПЗ не змінилися б.",
  "proposal.change": "{before} → {after}",
  "proposal.now.none": "не застосовується",
  "proposal.now.open": "залежить від відповіді",
  "proposal.now.in-force": "застосовується",
  "proposal.now.upcoming": "застосовуватиметься",
  "proposal.now.expired": "уже не застосовується",
  "proposal.cohort": "Синтетична когорта",
  "proposal.cohort.summary":
    "{n} різних ситуацій (комбінацій відповідей); клас змінюється в {changed}: вищий у {up}, нижчий у {down}.",
  "proposal.cohort.note":
    "Не оцінка ринку: це всі комбінації відповідей, які не суперечать перехресній перевірці MDCG і умовам узгодженості. Ситуація — обидва класи разом із відповідями, що їх вирішили; комбінації, що різняться лише іншими відповідями, — одна ситуація.",
  "proposal.matrix.caption": "Рядки: клас за чинним правилом; стовпці: клас за проєктом",
  "proposal.matrix.corner": "Чинне ↓ / проєкт →",
  "proposal.constraints": "Умови узгодженості ({n})",
  "proposal.examples": "Приклади MDCG за проєктом",
  "proposal.examples.implied": "з виведеною відповіддю: {list}",
  "proposal.chip": "Потрібно лише для проєкту змін",
  "proposal.chip.tag": "для проєкту",

  "example.heading": "Приклад із настанови",
  "example.reading": "Як ми прочитали приклад",
  "example.expected": "Настанова дає: {list}",
  "example.matches": "Рушій дає те саме.",
  "example.differs": "Відповіді змінено, тож результат може відрізнятися від настанови.",

  "legend.heading": "Як читати мапу",
  "legend.ink": "Застосовується й чинне",
  "legend.pencil": "Залежить від відповіді, якої ще немає",
  "legend.dotted": "Застосовуватиметься з певної дати",
  "legend.marker": "Причина й наслідок: наведіть на атрибут чи гілку",
  "legend.redpen": "Як було б за проєктом змін",
  "help.text":
    "Натисніть атрибут угорі, щоб змінити відповідь. Гілка розгортається кліком, а вимога відкриває картку з цитатами.",

  "quote.loading": "Завантажую текст джерела…",
  "quote.verified": "Перевірено в браузері: sha256 секції {hash}… збігається, цитата на позиціях {start}–{end}",
  "quote.failed": "Увага: текст секції не збігається з цитатою",
  "quote.whole": "Уся секція",
  "quote.less": "Згорнути секцію",
  "quote.source": "{title} на {host}",
  "quote.error": "Не вдалося завантажити тексти джерел: {message}",

  "checklist.label": "Чекліст вимог",
  "checklist.results": "Результати правил",
  "checklist.questions": "Відкриті питання",
  "checklist.questions.none": "Відкритих питань немає: усе визначено.",
  "checklist.notApplicable": "Не застосовується ({n})",
  "checklist.quotes": "Цитати ({n})",
  "checklist.empty": "У цій гілці нічого не застосовується.",

  "us.heading": "США: наступний етап",
  "us.body":
    "Американського треку в демо ще немає. Жодного правила FDA тут не закодовано й не процитовано, тож і відповідей немає.",
  "us.back": "Повернутися до ЄС",

  "footer.texts":
    "Тексти законодавства й настанов: © Європейський Союз, повторне використання дозволено (рішення Комісії 2011/833/ЄС; CC BY 4.0). Змінено лише форму: пробіли нормалізовано, маркери консолідації прибрано.",
  "footer.code": "Код: Apache-2.0. Шрифти Literata і Arsenal: SIL Open Font License 1.1.",
  "footer.sources": "Джерела й редакції ({n})",
  "footer.retrieved": "завантажено {date}",
  "footer.repo": "Код і дані на GitHub",
};

export type MessageKey = keyof typeof uk;

const en: Record<MessageKey, string> = {
  "app.title": "Medical device regulatory navigator",
  "app.lede":
    "Describe the software to see whether it is a medical device in the EU, which class it is and what follows from that. Every conclusion rests on a verbatim quote.",
  "banner.lead": "A demo, not legal advice.",
  "banner.rest":
    "The manufacturer determines the class; for IIa and above a notified body confirms it. The rules are a draft, not checked by a regulatory specialist.",

  "market.legend": "Market",
  "market.EU": "EU",
  "market.US": "US",
  "view.legend": "View",
  "view.map": "Map",
  "view.checklist": "Checklist",
  "lang.legend": "Interface language",
  "lang.uk": "Укр",
  "lang.en": "Eng",
  "asOf.label": "As of",
  "asOf.today": "Today",
  "asOf.todayMark": "Today, {date}",
  "asOf.tick": "{date}: {n, plural, one {# requirement starts to apply} other {# requirements start to apply}}",
  "asOf.prev": "Previous key date",
  "asOf.next": "Next key date",
  "proposals.label": "Proposed changes",
  "proposals.none": "No proposed changes in the data yet",
  "proposals.on": "In red: how the result would change if the proposal were adopted",

  "device.heading": "The software",
  "device.custom": "Your software",
  "device.modified": "{name} (modified)",
  "preset.label": "Example from guidance",
  "preset.none": "No example",
  "device.clear": "Clear answers",
  "group.qualification": "Is it a device",
  "group.classification": "Class",
  "group.ai": "AI",
  "group.market": "Market",
  "group.guidance": "For the cross-check",
  "chip.yes": "yes",
  "chip.no": "no",
  "chip.unknown": "don't know",
  "chip.text": "{label}: {value}",
  "chip.aria": "{label}: {value}. Change the answer",
  "chips.rest.show": "Show the rest ({n})",
  "chips.rest.hide": "Hide the rest",
  "chips.rest.hint": "These answers change nothing right now",
  "editor.close": "Done",
  "editor.concept": "The concept in the source",
  "answer.legend": "Answer",
  "answer.yes": "Yes",
  "answer.no": "No",
  "answer.unknown": "Don't know",

  "map.label": "Map of the requirements for this software",
  "branch.class": "Class",
  "branch.market": "Route to market",
  "branch.qms": "Quality system",
  "branch.clinical": "Clinical evidence",
  "branch.cyber": "Cybersecurity and data",
  "branch.ai": "AI",
  "branch.count": "{n, plural, one {# requirement} other {# requirements}}",
  "branch.open": "{n, plural, one {# depends on an answer} other {# depend on answers}}",
  "branch.from": "from {date}",
  "branch.none": "nothing applies",
  "branch.decides": "What decides it:",
  "branch.more": "and {n} more",
  "branch.answer": "Answer",
  "leaf.open": "depends on an answer",
  "leaf.from": "from {date}",
  "leaf.until": "until {date}",
  "leaf.optional": "needs answers to check",
  "leaf.either": "{a} or {b}",

  "ladder.heading": "Class",
  "ladder.why": "Why class {value}",
  "ladder.oneOf": "One of: {list}",
  "ladder.maybeNone": "May not be a medical device at all",
  "ladder.none": "No class: the classification rules do not apply",
  "ladder.aria.value": "Class {value}. Open the explanation",
  "ladder.aria.possible": "Possible classes: {list}. Open the explanation",
  "ladder.aria.none": "No class. Open the explanation",
  "ladder.proposal": "Under the proposal: {list}",
  "qual.oneOf": "One of: {list}",
  "qual.open": "Not yet known whether it is a medical device",
  "device.openCount": "Depends on {n, plural, one {# answer} other {# answers}}",

  "card.label": "Explanation",
  "card.close": "Close",
  "card.how": "How to comply",
  "card.requirement": "Requirement",
  "card.deliverable": "Document or evidence",
  "card.standards": "Standards",
  "card.standards.none": "No specific standard",
  "card.who": "Who",
  "card.when": "From when",
  "card.basis": "Legal basis",
  "card.guidance": "What the guidance says",
  "card.dateBasis": "Where the date comes from",
  "card.dependsOn": "Depends on",
  "applies.true": "Applies to this software",
  "applies.null": "Depends on an answer",
  "applies.false": "Does not apply to this software",
  "timing.in-force": "in force since {date}",
  "timing.upcoming": "applies from {date}",
  "timing.expired": "applied until {date}",
  "standard.edition": "edition {edition}",
  "standard.catalogue": "Catalogue page",
  "standard.metadata": "The standard's text is not reproduced: only its number, edition and purpose.",

  "rule.result": "Result",
  "rule.decided": "What decided it",
  "rule.stricter": "Why not stricter",
  "rule.questions": "What would decide it",
  "rule.notApplicable": "Does not apply",
  "rule.draft": "The rule is a draft (revision {revision}), not checked by a specialist.",
  "rule.from": "Applies from {date}",
  "rule.upcoming": "Not applicable yet: from {date}",
  "rule.hypothetical": "A proposal, not the law",
  "node.true": "yes",
  "node.false": "no",
  "node.null": "unknown",
  "cross.consistent": "Agrees with the answers: {actual}",
  "cross.inconsistent": "Disagrees: the check gives {actual} but the answers point to {expected}",
  "cross.incomplete": "Not enough answers to check",
  "cross.questions": "Answers for the check",

  "proposal.leaf": "under the proposal: {what}",
  "proposal.decides": "What decides it under the proposal:",
  "proposal.state.none": "would not apply",
  "proposal.state.open": "would depend on an answer",
  "proposal.state.in-force": "would apply",
  "proposal.state.upcoming": "would apply from {date}",
  "proposal.state.expired": "would no longer apply",
  "proposal.branch": "{n, plural, one {the proposal changes # item} other {the proposal changes # items}}",
  "proposal.heading": "If the proposal were adopted",
  "proposal.title": "{title}: a proposal, not the law.",
  "proposal.questions": "What else the proposal needs to know",
  "proposal.changes": "What would change in the requirements",
  "proposal.changes.none": "The requirements for this software would not change.",
  "proposal.change": "{before} → {after}",
  "proposal.now.none": "does not apply",
  "proposal.now.open": "depends on an answer",
  "proposal.now.in-force": "applies",
  "proposal.now.upcoming": "will apply",
  "proposal.now.expired": "no longer applies",
  "proposal.cohort": "Synthetic cohort",
  "proposal.cohort.summary":
    "{n} distinct situations (answer combinations); the class changes in {changed}: higher in {up}, lower in {down}.",
  "proposal.cohort.note":
    "Not a market estimate: every combination of answers that neither the MDCG cross-check nor the coherence conditions contradict. A situation is both classes with the answers that decided them; combinations that differ only in other answers are one situation.",
  "proposal.matrix.caption": "Rows: the class under the rule in force; columns: under the proposal",
  "proposal.matrix.corner": "In force ↓ / proposal →",
  "proposal.constraints": "Coherence conditions ({n})",
  "proposal.examples": "MDCG examples under the proposal",
  "proposal.examples.implied": "with an implied answer: {list}",
  "proposal.chip": "Needed only for the proposed change",
  "proposal.chip.tag": "for the proposal",

  "example.heading": "Example from the guidance",
  "example.reading": "How we read the example",
  "example.expected": "The guidance gives: {list}",
  "example.matches": "The engine gives the same.",
  "example.differs": "The answers were changed, so the result may differ from the guidance.",

  "legend.heading": "How to read the map",
  "legend.ink": "Applies and in force",
  "legend.pencil": "Depends on an answer not given yet",
  "legend.dotted": "Will apply from a set date",
  "legend.marker": "Cause and effect: hover an attribute or a branch",
  "legend.redpen": "As it would be under a proposed change",
  "help.text":
    "Click an attribute above to change the answer. Click a branch to expand it; a requirement opens a card with quotes.",

  "quote.loading": "Loading the source text…",
  "quote.verified": "Checked in your browser: section sha256 {hash}… matches, the quote is at {start}–{end}",
  "quote.failed": "Warning: the section text does not match the quote",
  "quote.whole": "Whole section",
  "quote.less": "Collapse the section",
  "quote.source": "{title} at {host}",
  "quote.error": "Could not load the source texts: {message}",

  "checklist.label": "Checklist of requirements",
  "checklist.results": "Rule results",
  "checklist.questions": "Open questions",
  "checklist.questions.none": "No open questions: everything is determined.",
  "checklist.notApplicable": "Does not apply ({n})",
  "checklist.quotes": "Quotes ({n})",
  "checklist.empty": "Nothing in this branch applies.",

  "us.heading": "US: the next stage",
  "us.body": "The US track is not in this demo yet. No FDA rule is encoded or quoted here, so there are no answers.",
  "us.back": "Back to the EU",

  "footer.texts":
    "Legislation and guidance texts: © European Union, reuse authorised (Commission Decision 2011/833/EU; CC BY 4.0). Only the form is changed: whitespace normalised, consolidation markers removed.",
  "footer.code": "Code: Apache-2.0. Fonts Literata and Arsenal: SIL Open Font License 1.1.",
  "footer.sources": "Sources and editions ({n})",
  "footer.retrieved": "retrieved {date}",
  "footer.repo": "Code and data on GitHub",
};

export type Lang = "uk" | "en";
export const DICTIONARY: Record<Lang, Record<MessageKey, string>> = { uk, en };

const pluralRules = new Map<Lang, Intl.PluralRules>();

/**
 * `{n, plural, one {# вимога} few {# вимоги} many {# вимог} other {# вимоги}}` → the option of the count's plural
 * category in `lang` (Intl.PluralRules), `#` = the count; without the count the text stays as written.
 */
function plurals(text: string, lang: Lang, vars: Record<string, string | number>): string {
  let out = "";
  let i = 0;
  for (;;) {
    const start = text.indexOf("{", i);
    const head = start < 0 ? null : /^\{(\w+), plural,/.exec(text.slice(start));
    if (start < 0) return out + text.slice(i);
    if (!head) {
      out += text.slice(i, start + 1);
      i = start + 1;
      continue;
    }
    const options: Record<string, string> = {};
    let j = start + head[0].length;
    for (;;) {
      const option = /^\s*(\w+)\s*\{([^{}]*)\}/.exec(text.slice(j));
      if (!option) break;
      options[option[1] ?? ""] = option[2] ?? "";
      j += option[0].length;
    }
    const end = text.indexOf("}", j);
    const name = head[1] ?? "";
    const count = Number(vars[name]);
    if (!(name in vars) || Number.isNaN(count)) {
      out += text.slice(i, end + 1);
    } else {
      let rules = pluralRules.get(lang);
      if (!rules) {
        rules = new Intl.PluralRules(lang);
        pluralRules.set(lang, rules);
      }
      out +=
        text.slice(i, start) +
        (options[rules.select(count)] ?? options.other ?? "").replaceAll("#", String(vars[name]));
    }
    i = end + 1;
  }
}

/** The message for `key` in `lang` (the key itself when unknown), plurals chosen and `{name}` placeholders filled. */
export function translate(lang: Lang, key: MessageKey, vars: Record<string, string | number> = {}): string {
  const text = DICTIONARY[lang][key] ?? key;
  return plurals(text, lang, vars).replaceAll(/\{(\w+)\}/g, (m, name: string) =>
    name in vars ? String(vars[name]) : m,
  );
}
