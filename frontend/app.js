import { request } from './api.js';

const $ = (selector) => document.querySelector(selector);
const escape = (value) => String(value ?? '').replace(/[&<>"']/g, (c) =>
  ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const peso = (value) => '₱' + value.toLocaleString('en-PH', {minimumFractionDigits: 2, maximumFractionDigits: 2});
const day = (value) => new Date(value).toLocaleDateString('en-CA',{timeZone:'Asia/Manila'});
const date = (value) => new Date(value).toLocaleString('en-PH',{timeZone:'Asia/Manila',dateStyle:'medium',timeStyle:'short'});
const created = (days) => new Date(Date.now()-86400000*days).toISOString();
const catalog = (state) => state.inventory.filter((p) => p.price !== undefined);
function quote(items, method) {
  const subtotal = items.reduce((sum,p) => sum + p.price*p.qty,0);
  const fee = method === 'Delivery' && !items.some((p) => p.id === 'large') ? 20 : 0;
  return {subtotal,fee,total:subtotal+fee};
}
let role = null;
let account = null;
let ownerRegistrationOpen = false;
let authMode = 'signin';
let page = 'home';
let state = null;
let busy = false;
let cart = {}, method = 'Delivery', address = '', payment = 'Cash';
let filter = 'All', activeId = null, editing = null, inventoryId = null, search = '', paymentError = '', failure = false;
let imageReady = false;
const heroImage = new Image();
heroImage.onload = () => { imageReady = true; document.querySelectorAll('.hero').forEach(el=>el.classList.add('has-image')); };
const heroUrl = new URL('./hero.png', import.meta.url).href;
heroImage.src = heroUrl;
const statuses = ['Pending','On Delivery','Ready for Pickup','Completed','Cancelled'];
const customerNav = [['home','Home'],['order','Place order'],['orders','My orders'],['profile','Profile']];
const adminNav = [['dashboard','Dashboard'],['orders','Orders'],['inventory','Inventory']];
const buttons = (label,action,value='',style='',disabled=false) =>
  '<button type="button" class="btn '+style+'" data-action="'+action+'" data-value="'+escape(value)+'"'+(disabled?' disabled':'')+'>'+escape(label)+'</button>';
const go = (label, value, style='') => buttons(label,'go',value,style);
const tag = (value) => '<span class="tag '+value.toLowerCase().replaceAll(' ','-')+'">'+escape(value)+'</span>';
const title = (name,desc) => '<header class="heading"><h1>'+name+'</h1><p>'+desc+'</p></header>';
const brand = '<div class="brand"><span class="drop" aria-hidden="true"></span>AquaRefresh</div>';
const hero = (content) => '<section class="hero '+(imageReady?'has-image':'')+'">'+content+'</section>';
const message = (text) => '<div class="error" role="alert">'+escape(text)+'</div>';
function notify(text) {
  $('#notice').textContent = text;
  clearTimeout(notify.timer);
  notify.timer = setTimeout(() => { $('#notice').textContent = ''; },3400);
}
function navigate(next) {
  page = next;
  if (next === 'orders') filter = 'All';
  render();
  window.scrollTo(0,0);
  $('main h1')?.focus({preventScroll:true});
}
const themeKey = 'aquarefresh-theme';
const systemTheme = window.matchMedia('(prefers-color-scheme: dark)');
try {
  const preference = localStorage.getItem(themeKey);
  if (preference==='dark' || preference==='light') document.documentElement.dataset.theme = preference;
} catch {
  // The system color preference still works without browser storage.
}

function currentTheme() {
  return document.documentElement.dataset.theme ?? (systemTheme.matches?'dark':'light');
}

function themeLabel() {
  return currentTheme()==='dark'?'Light mode':'Dark mode';
}

function themeButton() {
  return '<button type="button" class="theme-toggle" data-action="theme">'+themeLabel()+'</button>';
}

function updateThemeButtons() {
  for (const button of document.querySelectorAll('[data-action="theme"]')) {
    button.textContent = themeLabel();
  }
}

function toggleTheme() {
  const theme = currentTheme()==='dark'?'light':'dark';
  document.documentElement.dataset.theme = theme;
  try { localStorage.setItem(themeKey,theme); } catch { /* Preserve the choice for this page. */ }
  updateThemeButtons();
}

systemTheme.addEventListener('change',updateThemeButtons);
window.addEventListener('storage',(event)=>{
  if (event.key!==themeKey && event.key!==null) return;
  if (event.newValue==='dark' || event.newValue==='light') document.documentElement.dataset.theme = event.newValue;
  else delete document.documentElement.dataset.theme;
  updateThemeButtons();
});

function auth() {
  const registering = authMode!=='signin';
  const owner = authMode==='admin';
  const heading = owner?'Set up the station':registering?'Create an account':'Welcome back.';
  const intro = owner?'Create the owner account to manage stock and orders.':
    registering?'Create your customer account to order refills.':'Sign in to your water refilling station portal.';
  const form = '<form id="auth-form" class="stack">'+
    (registering?'<label>Name<input name="name" autocomplete="name" maxlength="80" required></label>':'')+
    '<label>Email<input name="email" type="email" autocomplete="username" maxlength="254" required></label>'+
    '<label>Password<input name="password" type="password" autocomplete="'+(registering?'new-password':'current-password')+'" '+
    (registering?'minlength="12" aria-describedby="password-hint" ':'')+'maxlength="128" required></label>'+
    (registering?'<small id="password-hint">Use 12 to 128 characters.</small>':
      '<label class="choice"><input type="checkbox" name="remember">Keep me signed in</label>')+
    '<p class="error auth-error" role="alert" hidden></p>'+
    '<button class="btn">'+(owner?'Create owner account':registering?'Create customer account':'Sign in')+'</button></form>';
  const options = registering?buttons('Back to sign in','auth-mode','signin','secondary'):
    buttons('Create customer account','auth-mode','customer','secondary')+
    (ownerRegistrationOpen?buttons('Set up as station owner','auth-mode','admin','secondary'):'');
  return '<div class="auth"><main class="auth-main"><div>'+
    '<div class="auth-toolbar">'+brand+themeButton()+'</div>'+
    '<h1 tabindex="-1">'+heading+'</h1><p>'+intro+'</p>'+form+
    '<div class="auth-options">'+options+'</div></div></main>'+
    hero('<h2>Fresh water for every day.</h2><p>Order refills for delivery or pickup and follow your order from the station to your doorstep.</p>')+'</div>';
}
function home() {
  return title('Welcome, '+escape(state.profile.name.split(' ')[0])+'.','Browse purified water refills and choose delivery or station pickup.')+
    hero('<h2>Fresh water, made simple.</h2><p>Get free delivery on orders that include a 5-gallon refill.</p>'+go('Order a refill','order'))+
    '<h2>Shop water refills</h2><div class="grid">'+catalog(state).map((p) =>
      '<article class="product"><div class="visual" aria-hidden="true"><img alt="" src="'+heroUrl+'"></div><h3>'+escape(p.name)+'</h3><p>'+peso(p.price)+' · '+p.stock+' available</p>'+buttons(p.stock?'Add to order':'Sold out','add',p.id,'',!p.stock)+'</article>').join('')+'</div>';
}
function draftItems() {
  const order = editing === null ? null : state.orders.find((o)=>o.id===editing);
  return catalog(state).filter((p)=>cart[p.id]>0).map((p)=>({
    id:p.id,name:p.name,price:order?.items.find((i)=>i.id===p.id)?.price ?? p.price,qty:cart[p.id]
  }));
}
function oldQty(id) {
  return state.orders.find((o)=>o.id===editing)?.items.find((p)=>p.id===id)?.qty || 0;
}
function cost(items, amounts) {
  return items.map((p)=>'<div class="row line"><span>'+escape(p.name)+' × '+p.qty+'</span><strong>'+peso(p.price*p.qty)+'</strong></div>').join('')+
    '<div class="row line"><span>Subtotal</span><strong>'+peso(amounts.subtotal)+'</strong></div>'+
    '<div class="row line"><span>Delivery fee</span><strong>'+peso(amounts.fee)+'</strong></div>'+
    '<div class="row line"><strong>Total</strong><strong>'+peso(amounts.total)+'</strong></div>';
}
function orderForm() {
  const items = draftItems();
  return title(editing===null?'Place an order':'Edit order #'+orderNumber(editing),'Choose your refills and how you want to receive them.')+
    '<div class="columns"><div class="stack"><section class="panel"><h2>Water refills</h2>'+
    catalog(state).map((p)=>'<div class="row line"><div><strong>'+escape(p.name)+'</strong><br><small>'+peso(p.price)+' · '+(p.stock+oldQty(p.id))+' available</small></div>'+
    '<div class="qty"><button type="button" class="btn secondary" aria-label="Remove one '+escape(p.name)+'" data-action="minus" data-value="'+p.id+'" '+(!cart[p.id]?'disabled':'')+'>−</button><strong>'+ (cart[p.id]||0) +'</strong>'+
    '<button type="button" class="btn secondary" aria-label="Add one '+escape(p.name)+'" data-action="plus" data-value="'+p.id+'" '+((cart[p.id]||0)>=p.stock+oldQty(p.id)?'disabled':'')+'>+</button></div></div>').join('')+
    '</section><form id="delivery" class="panel stack"><h2>Fulfillment</h2>'+
    ['Delivery','Pickup'].map((option)=>'<label class="choice"><input type="radio" name="method" value="'+option+'" '+(method===option?'checked':'')+'>'+option+'</label>').join('')+
    (method==='Delivery'?'<label>Delivery address<textarea name="address" maxlength="250" required>'+escape(address)+'</textarea></label>':'<p>Pick up at the station in Ligao City, Albay.</p>')+
    '<button class="btn" '+(!items.length?'disabled':'')+'>Continue to checkout</button>'+
    (editing!==null?buttons('Discard changes','discard','','secondary'):'')+'</form></div><section class="panel"><h2>Order summary</h2>'+
    (items.length?cost(items,quote(items,method)):'<p>Add a refill to see your total.</p>')+'</section></div>';
}
function checkout() {
  const items = draftItems();
  return title('Checkout','Review your order before you confirm.')+
    '<div class="columns"><section class="panel"><h2>Order summary</h2>'+cost(items,quote(items,method))+
    '<p><strong>'+method+'</strong>'+ (method==='Delivery'?' · '+escape(address):' · Ligao City, Albay')+'</p>'+go('Back to order','order','secondary')+'</section>'+
    '<form class="panel stack" id="checkout"><h2>Payment method</h2>'+(paymentError?message(paymentError):'')+
    (editing!==null?'<p>'+ (payment==='Cash'?'Cash': 'GCash (simulation)')+'</p>':
      ['Cash','GCash'].map((option)=>'<label class="choice"><input type="radio" name="payment" value="'+option+'" '+(payment===option?'checked':'')+'>'+ (option==='Cash'?(method==='Delivery'?'Cash on delivery':'Cash on pickup'):'GCash (simulation)')+'</label>').join(''))+
    (payment==='GCash'&&editing===null?'<p>Simulated payment. No account details or money are collected.</p><label class="choice"><input type="checkbox" name="failure" '+(failure?'checked':'')+'>Simulate a failed payment</label>':'')+
    '<button class="btn">'+(editing===null?'Place order':'Save changes')+'</button></form></div>';
}
const orderNumber = (id) => String(id).padStart(4,'0');
function visibleOrders() { return [...state.orders].sort((a,b)=>b.id-a.id); }
function table(orders) {
  const customerLabel = role==='admin'?'Customer':'Date';
  return orders.length?'<div class="table"><table><thead><tr><th scope="col">Order</th><th scope="col">'+customerLabel+
    '</th><th scope="col">Status</th><th scope="col">Total</th><th scope="col"><span class="sr">Details</span></th></tr></thead><tbody>'+
    orders.map((o)=>'<tr><td data-label="Order">#'+orderNumber(o.id)+'</td><td data-label="'+customerLabel+'">'+escape(role==='admin'?o.customer:date(o.created))+'</td><td data-label="Status">'+tag(o.status)+'</td><td data-label="Total">'+
      peso(o.total)+'</td><td data-label="Details">'+buttons('View','detail',o.id,'secondary')+'</td></tr>').join('')+'</tbody></table></div>':
    '<div class="empty">'+(filter!=='All'?'No orders match this status. Select All to see every order.':
      role==='admin'?'No refill orders yet. New customer orders appear here.':'No orders yet. Place a refill order to start.')+'</div>';
}
function ordersPage() {
  return title(role==='admin'?'Orders':'My orders',role==='admin'?'Review and update refill orders.':'Check the progress of your refill orders.')+
    '<div class="panel stack"><div class="row">'+['All',...statuses].map((s)=>buttons(s,'filter',s,s===filter?'':'secondary')).join(' ')+'</div>'+
    table(visibleOrders().filter((o)=>filter==='All'||o.status===filter))+'</div>';
}
function detail(confirmed=false) {
  const o = visibleOrders().find((item)=>item.id===activeId);
  if (!o) return title('Order unavailable','Choose an order from your order list.')+go('Back to orders','orders');
  const transit = o.method==='Pickup'?'Ready for Pickup':'On Delivery';
  const path = ['Pending',transit,'Completed'];
  let actions = '';
  if (o.status==='Pending') {
    if (role==='admin') actions += buttons('Mark '+transit.toLowerCase(),'advance',transit);
    else if (o.payment==='Cash') actions += buttons('Edit order','edit',o.id,'secondary');
    actions += buttons('Cancel order','cancel',o.id,'danger');
  } else if (role==='admin' && o.status===transit) actions += buttons('Mark completed','advance','Completed');
  return title(confirmed?'Order placed':'Order #'+orderNumber(o.id),confirmed?'Your order #'+orderNumber(o.id)+' is ready for station review.':'Review fulfillment, payment and order progress.')+
    '<div class="columns"><section class="panel stack"><div class="row"><h2>Order progress</h2>'+tag(o.status)+'</div>'+
    (o.status==='Cancelled'?'': '<div class="steps">'+path.map((step,i)=>'<span class="'+(i<=path.indexOf(o.status)?'done':'')+'">'+step+'</span>').join('')+'</div>')+
    '<div><strong>'+escape(o.customer)+'</strong><p>'+date(o.created)+' · '+o.method+(o.address?' · '+escape(o.address):'')+'</p></div>'+
    '<p>'+ (o.payment==='GCash'?'GCash simulation':'Cash')+' · '+ (o.status==='Cancelled'&&o.payment==='GCash'?'Simulated payment reversed':o.status==='Cancelled'?'Void':o.status==='Completed'||o.payment==='GCash'?'Paid':'Due at fulfillment')+'</p>'+
    '<div class="row">'+actions+go('Back to orders','orders','secondary')+'</div></section><section class="panel"><h2>Order breakdown</h2>'+cost(o.items,o)+'</section></div>';
}
function dashboard() {
  const orders = visibleOrders();
  const today = day(Date.now());
  const sales = orders.filter((o)=>o.completed&&day(o.completed)===today).reduce((total,o)=>total+o.total,0);
  const low = state.inventory.filter((p)=>p.stock<=p.min).length;
  const daily = Array.from({length:7},(_,i)=>{
    const d = day(created(6-i));
    return {label:new Date(created(6-i)).toLocaleDateString('en-PH',{weekday:'short',timeZone:'Asia/Manila'}),
      sum:orders.filter((o)=>o.completed&&day(o.completed)===d).reduce((total,o)=>total+o.total,0)};
  });
  const max = Math.max(1,...daily.map((d)=>d.sum));
  const unique = new Set(orders.map(o=>o.owner)).size;
  return title('Station dashboard','Track refill orders, sales, and inventory.')+
    '<div class="grid">'+[['Total orders',orders.length],['Customers with orders',unique],['Sales today',peso(sales)]].map(([name,value])=>
      '<article class="panel"><p>'+name+'</p><strong class="metric">'+value+'</strong></article>').join('')+'</div>'+
    '<div class="columns"><section class="panel"><h2>Sales overview</h2><p>Completed orders over the last 7 days.</p><div class="bars">'+daily.map((d)=>
      '<div class="bar"><span>'+peso(d.sum).replace('.00','')+'</span><i style="height:'+Math.round(d.sum/max*75)+'%"></i><strong>'+d.label+'</strong></div>').join('')+'</div></section>'+
    '<section class="panel"><h2>Inventory alerts</h2><p>'+low+' '+(low===1?'item is':'items are')+' at or below their restock level.</p>'+go('Manage inventory','inventory','secondary')+'</section></div><br>'+
    '<section class="panel"><div class="row"><h2>Recent orders</h2>'+go('View all','orders','secondary')+'</div>'+table(orders.slice(0,5))+'</section>';
}
function inventory() {
  const list = state.inventory.filter((p)=>p.name.toLowerCase().includes(search.toLowerCase()));
  const item = state.inventory.find((p)=>p.id===inventoryId);
  return title('Inventory','Monitor available refills and station supplies.')+
    '<section class="panel stack"><form id="search" class="row"><label>Search inventory<input name="search" value="'+escape(search)+'" placeholder="Product or supply"></label><div>'+
    '<button class="btn secondary">Search</button> '+buttons('Add supply','inventory-edit','new')+'</div></form>'+
    '<div class="table"><table><thead><tr><th>Item</th><th>Available</th><th>Restock level</th><th>Status</th><th>Actions</th></tr></thead><tbody>'+
    list.map((p)=>'<tr><td data-label="Item">'+escape(p.name)+'</td><td data-label="Available">'+p.stock+' '+escape(p.unit)+'</td><td data-label="Restock level">'+p.min+'</td><td data-label="Status">'+
    (p.stock<=p.min?'<span class="tag low">Low stock</span>':tag('In stock'))+'</td><td data-label="Actions">'+buttons('Edit','inventory-edit',p.id,'secondary')+'</td></tr>').join('')+
    '</tbody></table></div>'+(list.length?'':'<p>No inventory items match your search. Clear the search to see all items.</p>')+'</section>'+
    (inventoryId===null?'':'<br><form id="inventory-form" class="panel stack"><h2>'+(item?'Edit '+escape(item.name):'Add station supply')+'</h2>'+
      (item?'<input type="hidden" name="expectedStock" value="'+item.stock+'">':'')+
      (item?.price!==undefined?'':'<label>Name<input name="name" required maxlength="60" value="'+escape(item?.name)+'"></label><label>Unit<input name="unit" required maxlength="20" value="'+escape(item?.unit)+'" placeholder="pcs"></label>')+
      '<label>Available stock<input name="stock" type="number" min="0" max="1000000" step="1" required value="'+(item?.stock??0)+'"></label>'+
      '<label>Restock level<input name="min" type="number" min="0" max="1000000" step="1" required value="'+(item?.min??5)+'"></label>'+
      '<div class="row"><button class="btn">Save item</button>'+buttons('Close','inventory-close','','secondary')+'</div></form>');
}
function profile() {
  return title('My profile','Update the name and address used for future orders.')+
    '<form id="profile" class="panel stack"><label>Name<input name="name" maxlength="80" required value="'+escape(state.profile.name)+'"></label>'+
    '<label>Default delivery address<textarea name="address" maxlength="250">'+escape(state.profile.address)+'</textarea></label><div><button class="btn">Save profile</button></div></form>';
}
function render() {
  if (!role) { $('#app').innerHTML = auth(); return; }
  const screens = {home,order:orderForm,checkout,orders:ordersPage,detail,confirmed:()=>detail(true),dashboard,inventory,profile};
  const nav = role==='admin'?adminNav:customerNav;
  const name = role==='admin'?account.name:state.profile.name;
  const section = ['detail','confirmed'].includes(page)?'orders':page==='checkout'?'order':page;
  $('#app').innerHTML = '<div class="layout"><aside class="sidebar"><div>'+brand+
    '<small>Water refilling station</small></div><nav class="nav" aria-label="Main navigation">'+nav.map(([route,label])=>
    '<button type="button" data-action="go" data-value="'+route+'" '+(route===section?'aria-current="page"':'')+'>'+label+'</button>').join('')+
    '</nav><button class="signout" type="button" data-action="logout">Sign out</button></aside><div class="shell"><header class="top"><small>'+
    (role==='admin'?'Station management':'Customer portal')+'</small><div class="top-actions">'+themeButton()+'<strong><span class="avatar" aria-hidden="true">'+escape(name.charAt(0).toUpperCase())+'</span>'+escape(name)+
    '</strong></div></header><main class="content">'+screens[page]()+'</main></div></div>';
  $('main h1')?.setAttribute('tabindex','-1');
}
function resetDraft() {
  editing = null; cart = {}; method = 'Delivery'; address = state?.profile?.address ?? '';
  payment = 'Cash'; failure = false; paymentError = '';
}

function setSession(session) {
  role = session.role;
  account = session.account;
  ownerRegistrationOpen = session.ownerRegistrationOpen;
  authMode = 'signin';
  state = session.state;
  inventoryId = null; search = ''; activeId = null; filter = 'All'; resetDraft();
  navigate(role==='admin'?'dashboard':'home');
}

function switchSession(session) {
  setSession(session);
  notify(session.role?'Your account changed in another tab.':'Your session ended. Sign in again.');
}

function accountChanged(session) {
  return session.account?.id!==account?.id;
}

function acceptState(next) {
  state = next;
  if (!Object.values(cart).some(Boolean)) address = state?.profile?.address ?? '';
}

async function write(path, method, payload) {
  return request(path,method,payload,account.id);
}

async function perform(operation, onError = (error) => notify(error.message)) {
  if (busy) return;
  busy = true;
  $('#app').setAttribute('aria-busy', 'true');
  try {
    await operation();
  } catch (error) {
    if (role && ['AUTHENTICATION_REQUIRED','FORBIDDEN','ORDER_NOT_FOUND','SESSION_CHANGED'].includes(error.code)) {
      const session = await request('/session').catch(() => null);
      if (session && accountChanged(session)) {
        switchSession(session);
        return;
      }
    }
    onError(error);
  } finally {
    busy = false;
    $('#app').removeAttribute('aria-busy');
  }
}

function submitAuthentication(data) {
  const password = data.get('password');
  const email = data.get('email');
  const registering = authMode!=='signin';
  const credentials = registering?{role:authMode,name:data.get('name'),email,password}:
    {login:email,password,remember:data.has('remember')};
  return perform(async () => {
    try {
      setSession(await request(registering?'/register':'/session','POST',credentials));
    } catch (error) {
      if (error.code==='OWNER_ALREADY_REGISTERED' || error.code==='OWNER_REGISTRATION_LOCAL_ONLY') {
        const session = await request('/session').catch(() => null);
        if (session) setSession(session);
      }
      if (role) return;
      if (error.code==='EMAIL_ALREADY_REGISTERED' || error.code==='INVALID_EMAIL') {
        const field = $('#auth-form [name="email"]');
        reportFieldError(field,error.message);
        field.focus();
        return;
      }
      const alert = $('.auth-error');
      alert.textContent = error.status===0&&registering?'Connection lost. Try signing in with the account you just entered before registering again.':error.message;
      alert.hidden = false;
      const field = $('#auth-form [name="password"]');
      field.value = '';
      field.focus();
    }
  });
}
function adjust(id,delta) {
  const product = catalog(state).find((p)=>p.id===id);
  if (!product) return false;
  const count = (cart[id]||0) + delta;
  if (count<0||(delta>0&&count>product.stock+oldQty(id))) return false;
  cart[id] = count;
  return true;
}
function changeOrder(status) {
  return perform(async () => {
    const result = await write('/orders/'+activeId+'/status','PATCH',{status});
    acceptState(result.state);
    render();
    notify('Order updated.');
  });
}

function placeOrder() {
  return perform(async () => {
    const items = draftItems().map(({id,qty})=>({id,qty}));
    const isNew = editing===null;
    const result = await write(isNew?'/orders':'/orders/'+editing,isNew?'POST':'PATCH',{
      items, method, address, payment, simulateFailure: isNew && payment==='GCash' && failure,
    });
    acceptState(result.state);
    activeId = result.order.id;
    resetDraft();
    navigate(isNew?'confirmed':'detail');
    if (!isNew) notify('Order changes saved.');
  }, (error) => {
    if (error.code==='PAYMENT_FAILED') failure = false;
    paymentError = error.status===0?'Connection lost. Check My orders before retrying to avoid placing a duplicate order.':error.message;
    render();
    $('.error')?.scrollIntoView({block:'nearest'});
  });
}

document.addEventListener('click',(event)=>{
  const button = event.target.closest('[data-action]');
  if (!button) return;
  const {action,value} = button.dataset;
  if (action==='theme') return toggleTheme();
  if (busy) return;
  if (!role && action==='auth-mode' && (['signin','customer'].includes(value) || (value==='admin'&&ownerRegistrationOpen))) {
    authMode = value;
    render();
    $('main h1')?.focus({preventScroll:true});
    return;
  }
  if (!role) return;
  if (action==='logout') return perform(async () => {
    setSession(await write('/session','DELETE'));
    $('#auth-form input')?.focus();
  });
  if (action==='go') {
    const allowed = role==='admin'?adminNav:customerNav;
    if (!allowed.some(([route])=>route===value)) return;
    return perform(async () => {
      const session = await request('/session');
      if (accountChanged(session)) switchSession(session);
      else { acceptState(session.state); navigate(value); }
    });
  }
  if (action==='add'&&role==='customer'&&adjust(value,1)) { navigate('order'); return notify('Refill added.'); }
  if (['plus','minus'].includes(action)&&role==='customer') {
    if (adjust(value,action==='plus'?1:-1)) {
      render();
      const target = document.querySelector('[data-action="'+action+'"][data-value="'+value+'"]');
      const other = document.querySelector('[data-action="'+(action==='plus'?'minus':'plus')+'"][data-value="'+value+'"]');
      (target.disabled?other:target).focus({preventScroll:true});
    }
  }
  if (action==='filter') { filter=value; render(); $('[data-action="filter"].btn:not(.secondary)')?.focus(); }
  if (action==='detail') { activeId=Number(value); navigate('detail'); }
  if (action==='discard') { resetDraft(); navigate('detail'); }
  if (action==='edit'&&role==='customer') {
    const order = visibleOrders().find((o)=>o.id===Number(value)&&o.status==='Pending'&&o.payment==='Cash');
    if (!order) return;
    editing=order.id;
    cart=Object.fromEntries(order.items.map((p)=>[p.id,p.qty]));
    method=order.method; address=order.address||state.profile.address; payment=order.payment;
    paymentError=''; failure=false; navigate('order');
  }
  if (action==='advance'&&role==='admin') changeOrder(value);
  if (action==='cancel'&&window.confirm('Cancel this pending order and return the refills to stock?')) changeOrder('Cancelled');
  if (action==='inventory-edit'&&role==='admin') {
    inventoryId=value; render(); $('#inventory-form input')?.focus();
  }
  if (action==='inventory-close') { inventoryId=null; render(); }
});
function clearFieldError(field) {
  const errorId = field.dataset.fieldError;
  if (!errorId) return;
  document.getElementById(errorId)?.remove();
  const description = (field.getAttribute('aria-describedby') || '').split(' ').filter((id)=>id && id!==errorId);
  if (description.length) field.setAttribute('aria-describedby',description.join(' '));
  else field.removeAttribute('aria-describedby');
  field.removeAttribute('aria-invalid');
  delete field.dataset.fieldError;
}

function reportFieldError(field, text) {
  clearFieldError(field);
  const error = document.createElement('small');
  error.id = field.form.id+'-'+field.name+'-error';
  error.className = 'field-error';
  error.textContent = text;
  error.setAttribute('role','alert');
  field.insertAdjacentElement('afterend',error);
  field.dataset.fieldError = error.id;
  field.setAttribute('aria-invalid','true');
  const description = field.getAttribute('aria-describedby');
  field.setAttribute('aria-describedby',[description,error.id].filter(Boolean).join(' '));
}

document.addEventListener('invalid',(event)=>{
  const field = event.target;
  if (!field.matches('#app input, #app textarea, #app select')) return;
  reportFieldError(field,field.validationMessage);
},true);

document.addEventListener('input',(event)=>{
  if (event.target.matches('#app [aria-invalid="true"]')) clearFieldError(event.target);
  if (event.target.matches('#delivery [name="address"]')) address = event.target.value;
});
document.addEventListener('change',(event)=>{
  const target=event.target;
  if (target.matches('#checkout [name="failure"]')) failure=target.checked;
  if (target.matches('#delivery [name="method"],#checkout [name="payment"]')) {
    if (target.name==='method') method=target.value;
    else { payment=target.value; paymentError=''; failure=false; }
    render();
    $('input[name="'+target.name+'"]:checked')?.focus({preventScroll:true});
  }
});
document.addEventListener('visibilitychange',()=>{
  if (document.visibilityState!=='visible' || !role) return;
  void perform(async () => {
    const session = await request('/session');
    if (accountChanged(session)) switchSession(session);
  }, ()=>{});
});
document.addEventListener('submit',(event)=>{
  event.preventDefault();
  if (busy) return;
  const form=event.target, data=new FormData(form);
  if (form.id==='auth-form'&&!role) return submitAuthentication(data);
  if (form.id==='delivery'&&role==='customer') {
    if (method==='Delivery'&&!address.trim()) {
      const field = form.elements.namedItem('address');
      reportFieldError(field,'Enter your delivery address.');
      field.focus();
      return;
    }
    paymentError=''; navigate('checkout');
  }
  if (form.id==='checkout'&&role==='customer') return placeOrder();
  if (form.id==='search'&&role==='admin') { search=data.get('search').trim(); render(); $('#search input')?.focus(); }
  if (form.id==='inventory-form'&&role==='admin') return perform(async () => {
    const isNew = inventoryId==='new';
    const values = {name:data.get('name'),unit:data.get('unit'),stock:Number(data.get('stock')),min:Number(data.get('min'))};
    if (!isNew) values.expectedStock = Number(data.get('expectedStock'));
    const result = await write(isNew?'/inventory':'/inventory/'+inventoryId,isNew?'POST':'PATCH',values);
    acceptState(result.state);
    inventoryId=null; search=''; render(); notify('Inventory saved.');
  });
  if (form.id==='profile'&&role==='customer') return perform(async () => {
    const result = await write('/profile','PATCH',{name:data.get('name'),address:data.get('address')});
    acceptState(result.state);
    render(); notify('Profile saved.');
  });
});

export function mountPortal(session) {
  setSession(session);
}
