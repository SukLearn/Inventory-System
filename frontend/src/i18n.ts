export type AppLanguage = "English" | "Georgian";

export const languageEvent = "furniture-shop-language";

// Keep Georgian wording here so it can be reviewed and corrected without
// changing the page components.
const georgian: Record<string, string> = {
  Dashboard: "მთავარი",
  Products: "პროდუქტები",
  Inventory: "მარაგი",
  Sales: "გაყიდვები",
  Reservations: "ჯავშნები",
  Payments: "გადახდები",
  Deliveries: "მიწოდებები",
  Customers: "მომხმარებლები",
  Suppliers: "მომწოდებლები",
  Contacts: "კონტაქტები",
  History: "ისტორია",
  Reports: "ანგარიშები",
  Employees: "თანამშრომლები",
  Settings: "პარამეტრები",
  "Sign out": "გასვლა",
  "Sign in": "შესვლა",
  Username: "მომხმარებლის სახელი",
  Password: "პაროლი",
  "Restoring your session…": "სესიის აღდგენა…",
  "Shop Name": "მაღაზიის სახელი",
  Theme: "თემა",
  Language: "ენა",
  English: "ინგლისური",
  Georgian: "ქართული",
  Dark: "შავი",
  White: "თეთრი",
  Obsidian: "ობსიდიანი",
  Save: "შენახვა",
  "Settings saved": "პარამეტრები შენახულია",
  "Change password": "პაროლის შეცვლა",
  "Current password": "მიმდინარე პაროლი",
  "New password": "ახალი პაროლი",
  "Confirm new password": "გაიმეორეთ ახალი პაროლი",
  "Reset password": "პაროლის განახლება",
  "At least 3 characters.": "მინიმუმ 3 სიმბოლო.",
  "At least 8 characters.": "მინიმუმ 8 სიმბოლო.",
  Loading: "იტვირთება",
  "Loading...": "იტვირთება...",
  "Loading…": "იტვირთება…",
  Period: "პერიოდი",
  Month: "თვე",
  Quarter: "კვარტალი",
  Year: "წელი",
  "Total earnings": "სრული შემოსავალი",
  "Imported product cost": "შემოტანილი პროდუქციის ღირებულება",
  "Financial loss": "ფინანსური დანაკარგი",
  "Returned products": "დაბრუნებული პროდუქტები",
  "Returned / refunded": "დაბრუნებული",
  "In transit": "გზაშია",
  "Paid / closed sales": "დახურული",
  "Most returned product": "ყველაზე ხშირად დაბრუნებული პროდუქტი",
  "Most sold product": "ყველაზე გაყიდვადი პროდუქტი",
  "Supplier earnings": "მომწოდებლის შემოსავალი",
  Supplier: "მომწოდებელი",
  Product: "პროდუქტი",
  "Movement type": "მოძრაობის ტიპი",
  Status: "სტატუსი",
  From: "დან",
  To: "მდე",
  All: "ყველა",
  ALL: "ყველა",
  ACTIVE: "აქტიური",
  REVERSED: "გაუქმებული",
  READY: "მზადაა",
  IN_TRANSIT: "გზაშია",
  DELIVERED: "მიწოდებულია",
  CANCELLED: "გაუქმებულია",
  COMPLETED: "დასრულებულია",
  RETURNED: "დაბრუნებულია",
  PARTIALLY_RETURNED: "ნაწილობრივ დაბრუნებულია",
  OUTSTANDING: "დარჩენილი",
  Outstanding: "დარჩენილი",
  PAID: "გადახდილია",
  Paid: "გადახდილი",
  UNPAID: "გადაუხდელი",
  PARTIALLY_PAID: "ნაწილობრივ გადახდილი",
  Show: "ჩვენება",
  "Total Outstanding": "სულ დარჩენილი",
  "Sale ID": "გაყიდვის ID",
  "Sale #": "გაყიდვა #",
  "Sale date": "გაყიდვის თარიღი",
  Date: "თარიღი",
  Customer: "მომხმარებელი",
  Contact: "კონტაქტი",
  Address: "მისამართი",
  Delivery: "მიწოდება",
  "In Transit": "გზაში",
  Delivered: "მიწოდებულია",
  "Payment Status": "გადახდის სტატუსი",
  "Sale Total": "გაყიდვის ჯამი",
  Remaining: "დარჩენილი",
  Action: "მოქმედება",
  "Complete sale": "გაყიდვის დასრულება",
  Quantity: "რაოდენობა",
  "Final unit price": "ერთეულის საბოლოო ფასი",
  "Payment method": "გადახდის მეთოდი",
  "Paid now": "მომხ გადახდილი",
  Notes: "შენიშვნები",
  CASH: "ნაღდი",
  CARD: "ბარათი",
  BANK_TRANSFER: "საბანკო გადარიცხვა",
  OTHER: "სხვა",
  Name: "სახელი",
  Category: "კატეგორია",
  "In stock": "მარაგში",
  Reserved: "დაჯავშნილი",
  Available: "ხელმისაწვდომი",
  "Available now": "ახლა ხელმისაწვდომი",
  "Purchase cost": "შესყიდვის ღირებულება",
  "Selling price": "გასაყიდი ფასი",
  "Product name": "პროდუქტის სახელი",
  "Add product": "პროდუქტის დამატება",
  "Delete / archive": "წაშლა / არქივში გადატანა",
  Delete: "წაშლა",
  "No records found.": "ჩანაწერები ვერ მოიძებნა.",
  "View note": "ნახვა",
  Note: "შენიშვნა",
  Close: "დახურვა",
  "Add Customer": "მომხმარებლის დამატება",
  "Add Supplier": "მომწოდებლის დამატება",
  "Add Contact": "კონტაქტის დამატება",
  phone: "ტელეფონი",
  address: "მისამართი",
  notes: "შენიშვნები",
  name: "სახელი",
  "Physical Stock": "ფიზიკური მარაგი",
  "Inventory Cost Value": "მარაგის ღირებულება",
  "Select supplier": "აირჩიეთ მომწოდებელი",
  "No supplier": "მომწოდებლის გარეშე",
  Import: "შემოტანა",
  "Import date": "შემოტანის თარიღი",
  "Purchase price": "შესყიდვის ფასი",
  Adjustment: "კორექტირება",
  Reason: "მიზეზი",
  "Correction direction": "კორექტირების მიმართულება",
  "Increase stock": "მარაგის გაზრდა",
  "Decrease stock": "მარაგის შემცირება",
  Result: "შედეგი",
  "Record adjustment": "კორექტირების ჩაწერა",
  Optional: "არასავალდებულო",
  Required: "სავალდებულო",
  RETURN: "დაბრუნება",
  LOST: "დაკარგული",
  DESTROYED: "დაზიანებული",
  CORRECTION: "კორექტირება",
  IMPORT: "შემოტანა",
  SALE: "გაყიდვა",
  Employee: "თანამშრომელი",
  Reverse: "გაუქმება",
  Manage: "მოქმედება",
  Reserve: "დაჯავშნა",
  Cancel: "გაუქმება",
  Sold: "გაყიდულია",
  Created: "შექმნილია",
  "Cancelled reservation": "გაუქმებული ჯავშანი",
  "Employee name": "თანამშრომლის სახელი",
  Role: "როლი",
  "Add employee": "თანამშრომლის დამატება",
  ADMIN: "ადმინისტრატორი",
  EMPLOYEE: "თანამშრომელი",
  Enabled: "აქტიურია",
  Disabled: "გამორთულია",
  "Top-selling products": "ყველაზე გაყიდვადი პროდუქტები",
  "Sales over time": "გაყიდვები დროში",
  Today: "დღეს",
  "Out of stock": "მარაგი ამოიწურა",
  Revenue: "შემოსავალი",
  Transactions: "ტრანზაქციები",
  Earnings: "შემოსავალი",
  Discounts: "ფასდაკლებები",
  COGS: "გაყიდული საქონლის თვითღირებულება",
  "Gross profit": "მთლიანი მოგება",
  "Products sold": "გაყიდული პროდუქტები",
  "Units sold": "გაყიდული ერთეულები",
  Units: "ერთეულები",
  "Inventory cost": "მარაგის ღირებულება",
  "Retail value": "საცალო ღირებულება",
};

const english = Object.fromEntries(
  Object.entries(georgian).map(([source, translated]) => [translated, source]),
);

let activeLanguage: AppLanguage = readLanguage();
let translating = false;
let observer: MutationObserver | undefined;

export function readLanguage(): AppLanguage {
  return localStorage.getItem("language") === "Georgian"
    ? "Georgian"
    : "English";
}

function translatePhrase(value: string, language: AppLanguage) {
  if (language === "English") {
    return english[value] || value;
  }
  if (georgian[value]) return georgian[value];

  const increase = value.match(/^Stock will increase by (.+)$/);
  if (increase) return `მარაგი გაიზრდება ${increase[1]}-ით`;
  const decrease = value.match(/^Stock will decrease by (.+)$/);
  if (decrease) return `მარაგი შემცირდება ${decrease[1]}-ით`;

  return value;
}

function translateText(node: Text) {
  const parent = node.parentElement;
  if (!parent || parent.closest("script, style, [data-no-translate], .modal p"))
    return;

  const match = node.data.match(/^(\s*)([\s\S]*?)(\s*)$/);
  if (!match || !match[2]) return;
  const source = match[2];

  if (parent.tagName === "OPTION" && !parent.hasAttribute("value")) {
    parent.setAttribute("value", english[source] || source);
  }

  const translated = translatePhrase(source, activeLanguage);
  const next = match[1] + translated + match[3];
  if (next !== node.data) node.data = next;
}

function translateAttributes(root: ParentNode) {
  root
    .querySelectorAll<HTMLElement>("[placeholder], [title], [aria-label]")
    .forEach((element) => {
      for (const attribute of ["placeholder", "title", "aria-label"]) {
        const value = element.getAttribute(attribute);
        if (!value) continue;
        const translated = translatePhrase(value, activeLanguage);
        if (translated !== value) element.setAttribute(attribute, translated);
      }
    });
}

function translateTree(root: Node) {
  if (root.nodeType === Node.TEXT_NODE) {
    translateText(root as Text);
    return;
  }
  if (!(root instanceof Element) && root !== document.body) return;

  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let node = walker.nextNode();
  while (node) {
    translateText(node as Text);
    node = walker.nextNode();
  }
  translateAttributes(root as ParentNode);
}

export function applyLanguage(language: AppLanguage = readLanguage()) {
  activeLanguage = language;
  document.documentElement.lang = language === "Georgian" ? "ka" : "en";
  translating = true;
  translateTree(document.body);
  translating = false;
  window.dispatchEvent(new Event(languageEvent));
}

export function saveLanguage(language: AppLanguage) {
  localStorage.setItem("language", language);
  applyLanguage(language);
}

export function installLanguageSupport() {
  if (observer) return;
  observer = new MutationObserver((mutations) => {
    if (translating) return;
    translating = true;
    for (const mutation of mutations) {
      if (mutation.type === "characterData") {
        translateText(mutation.target as Text);
      }
      for (const node of mutation.addedNodes) translateTree(node);
    }
    translating = false;
  });
  observer.observe(document.body, {
    childList: true,
    characterData: true,
    subtree: true,
  });
  applyLanguage(activeLanguage);
}
