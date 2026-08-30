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
  "Customer details": "მომხმარებლის დეტალები",
  "Customer details saved successfully.":
    "მომხმარებლის დეტალები წარმატებით შეინახა.",
  "Customer modification history": "მომხმარებლის ცვლილებების ისტორია",
  "No customer changes recorded.": "მომხმარებლის ცვლილებები არ არის.",
  "Surname (optional)": "გვარი (არასავალდებულო)",
  Surname: "გვარი",
  Phone: "ტელეფონი",
  "Nationality (optional)": "ეროვნება (არასავალდებულო)",
  Nationality: "ეროვნება",
  "Total amount spent": "სულ დახარჯული თანხა",
  "Total discount received": "სულ მიღებული ფასდაკლება",
  "Outstanding debt": "დარჩენილი დავალიანება",
  "Active reservation balance": "აქტიური ჯავშნების დარჩენილი თანხა",
  "Last purchase date": "ბოლო შეძენის თარიღი",
  "Last purchased item": "ბოლოს შეძენილი პროდუქტი",
  "Purchase history": "შესყიდვების ისტორია",
  "Reservation history": "ჯავშნების ისტორია",
  "Delivery Date": "მიწოდების თარიღი",
  "Delivery Status": "მიწოდების სტატუსი",
  "Payment Method": "გადახდის მეთოდი",
  Total: "ჯამი",
  Suppliers: "მომწოდებლები",
  Contacts: "კონტაქტები",
  History: "ისტორია",
  Reports: "ანგარიშები",
  Employees: "თანამშრომლები",
  Settings: "პარამეტრები",
  Other: "სხვა",
  Menu: "მენიუ",
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
  "Total Revenue": "შემოსავალი",
  "Imported product cost": "შემოტანილი პროდუქციის ღირებულება",
  "Financial loss": "ფინანსური დანაკარგი",
  "Returned products": "დაბრუნებული პროდუქტები",
  "Returned / refunded": "დაბრუნებული",
  "In transit": "გზაშია",
  "Paid / closed sales": "დახურული გაყიდვები",
  "Most returned product": "ყველაზე ხშირად დაბრუნებული პროდუქტი",
  "Most sold product": "ყველაზე გაყიდვადი პროდუქტი",
  "Supplier Revenue": "მომწოდებლის შემოსავალი",
  Supplier: "მომწოდებელი",
  Product: "პროდუქტი",
  "Movement type": "მოძრაობის ტიპი",
  Status: "სტატუსი",
  From: "დან",
  To: "მდე",
  All: "ყველა",
  ACTIVE: "აქტიური",
  REVERSED: "გაუქმებული",
  CHANGED: "შეცვლილი",
  READY: "მზადაა",
  IN_TRANSIT: "გზაშია",
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
  "Sale details": "გაყიდვის დეტალები",
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
  "Payment status": "გადახდის სტატუსი",
  "Customer ID": "მომხმარებლის ID",
  "Product ID": "პროდუქტის ID",
  "Delivery status": "მიწოდების სტატუსი",
  "Delivery address": "მიწოდების მისამართი",
  "Delivery date": "მიწოდების თარიღი",
  "Original unit price": "ერთეულის საწყისი ფასი",
  "Discount per unit": "ფასდაკლება ერთეულზე",
  "Discount total": "ფასდაკლების ჯამი",
  "Purchase cost per unit": "ერთეულის შესყიდვის ღირებულება",
  "Cost total": "თვითღირებულების ჯამი",
  "Returned value": "დაბრუნებული ღირებულება",
  Returned: "დაბრუნებული",
  Returns: "დაბრუნებები",
  Refunded: "ანაზღაურებული",
  Refunds: "ანაზღაურებები",
  Amount: "თანხა",
  None: "არცერთი",
  "Sale Total": "გაყიდვის ჯამი",
  Remaining: "დარჩენილი",
  Action: "მოქმედება",
  "Complete sale": "გაყიდვის დასრულება",
  Quantity: "რაოდენობა",
  "Final unit price": "ერთეულის საბოლოო ფასი",
  "Regular unit price": "ერთეულის სტანდარტული ფასი",
  "Customer discount per unit": "მომხმარებლის ფასდაკლება ერთეულზე",
  "Sale total": "გაყიდვის ჯამი",
  "Payment method": "გადახდის მეთოდი",
  "Paid now": "მომხ გადახდილი",
  Notes: "შენიშვნები",
  CASH: "ნაღდი",
  CARD: "ბარათი",
  BANK_TRANSFER: "საბანკო გადარიცხვა",
  OTHER: "სხვა",
  Name: "სახელი",
  Category: "კატეგორია",
  "Select category": "აირჩიეთ კატეგორია",
  "Category Management": "კატეგორიების მართვა",
  "Category name": "კატეგორიის სახელი",
  "Create category": "კატეგორიის შექმნა",
  "Clear filters": "ფილტრების გასუფთავება",
  "Show records": "ჩანაწერების ჩვენება",
  Previous: "წინა",
  Next: "შემდეგი",
  "Table pagination": "ცხრილის გვერდები",
  "Minimum price": "მინიმალური ფასი",
  "Maximum price": "მაქსიმალური ფასი",
  "In stock": "მარაგში",
  Reserved: "დაჯავშნილი",
  "Reserved products": "დაჯავშნილი პროდუქტები",
  "Reserved products total": "დაჯავშნილი პროდუქტების ჯამი",
  Available: "ხელმისაწვდომი",
  "Available now": "ახლა ხელმისაწვდომი",
  "Purchase cost": "შესყიდვის ღირებულება",
  "Purchase Cost": "შესყიდვის ღირებულება",
  "Selling price": "გასაყიდი ფასი",
  "Product name": "პროდუქტის სახელი",
  "Product details": "პროდუქტის დეტალები",
  Details: "დეტალები",
  Image: "სურათი",
  Width: "სიგანე",
  Height: "სიმაღლე",
  Depth: "სიღრმე",
  Material: "მასალა",
  Color: "ფერი",
  Description: "აღწერა",
  "No category": "კატეგორიის გარეშე",
  "Active product": "აქტიური პროდუქტი",
  "Archived product (history retained)": "არქივშია (ისტორია შენარჩუნებულია)",
  "Only numbers and one decimal point are allowed.":
    "დაშვებულია მხოლოდ ციფრები და ერთი ათწილადის წერტილი.",
  "Enter a whole number using digits only.":
    "შეიყვანეთ მთელი რიცხვი მხოლოდ ციფრებით.",
  "Enter a valid numeric value.": "შეიყვანეთ სწორი რიცხვითი მნიშვნელობა.",
  "Enter a value within the allowed range.":
    "შეიყვანეთ მნიშვნელობა დაშვებულ დიაპაზონში.",
  "This numeric field is required.": "ეს რიცხვითი ველი სავალდებულოა.",
  "Save details": "დეტალების შენახვა",
  "Product images": "პროდუქტის სურათები",
  "Primary image": "მთავარი სურათი",
  "Make primary": "მთავარ სურათად დაყენება",
  "Delete image": "სურათის წაშლა",
  "No product images.": "პროდუქტის სურათები არ არის.",
  "Add product": "პროდუქტის დამატება",
  "Delete / archive": "წაშლა / არქივში გადატანა",
  Delete: "წაშლა",
  "No records found.": "ჩანაწერები ვერ მოიძებნა.",
  "View note": "ნახვა",
  "View Notes": "შენიშვნების ნახვა",
  View: "ნახვა",
  Changes: "ცვლილებები",
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
  "Inventory records": "მარაგის ჩანაწერები",
  "Inventory actions": "მარაგის მოქმედებები",
  "Inventory details": "მარაგის დეტალები",
  "← Back to Inventory": "← მარაგში დაბრუნება",
  "Current quantity": "მიმდინარე რაოდენობა",
  "Reserved quantity": "დაჯავშნილი რაოდენობა",
  "Last import date": "ბოლო შემოტანილი",
  "Last imported date": "ბოლო შემოტანის თარიღი",
  "Last sale date": "ბოლო გაყიდული",
  "Product activity": "პროდუქტის აქტივობა",
  "Field changed": "შეცვლილი ველი",
  "Old value": "ძველი",
  "New value": "ახალი",
  "Changed by": "შეცვალა",
  User: "მომხმარებელი",
  Type: "ტიპი",
  Price: "ფასი",
  "Select supplier": "აირჩიეთ მომწოდებელი",
  "No supplier": "მომწოდებლის გარეშე",
  "No customer": "მომხმარებლის გარეშე",
  "Walk-in customer": "ადგილზე მოსული მომხმარებელი",
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
  "Selling price per unit": "ერთეულის გასაყიდი ფასი",
  "Unit price": "ერთეულის ფასი",
  "Reservation total": "ჯავშნის ჯამი",
  "Deposit paid": "გადახდილი დეპოზიტი",
  "Expiration date": "ვადის გასვლის თარიღი",
  Expires: "ვადა",
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
  Discounts: "ფასდაკლებები",
  Discount: "ფასდაკლება",
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
    const showing = value.match(/^ნაჩვენებია (\d+)-(\d+), სულ (\d+)$/);
    if (showing)
      return `Showing ${showing[1]}-${showing[2]} of ${showing[3]}`;
    return english[value] || value;
  }
  if (georgian[value]) return georgian[value];

  const showing = value.match(/^Showing (\d+)-(\d+) of (\d+)$/);
  if (showing)
    return `ნაჩვენებია ${showing[1]}-${showing[2]}, სულ ${showing[3]}`;

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
