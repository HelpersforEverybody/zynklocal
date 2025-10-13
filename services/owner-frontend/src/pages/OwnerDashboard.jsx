// src/pages/OwnerDashboard.jsx
import React, { useEffect, useState } from "react";
import { apiFetch, getApiBase } from "../hooks/useApi";
import { useNavigate } from "react-router-dom";
import useWindowSize from "../hooks/useWindowSize";
import MobileBottomNav from "../components/MobileBottomNav";

/**
 * OwnerDashboard — simplified single-shop owner UI
 * - On mobile: Edit opens an inline editor below the item.
 * - Toggle (enable/disable) button added.
 * Functionality (API endpoints / validation) preserved.
 */

export default function OwnerDashboard() {
  const navigate = useNavigate();
  const API_BASE = getApiBase();
  const { isMobile } = useWindowSize();

  // data
  const [shop, setShop] = useState(null); // single shop
  const [menu, setMenu] = useState([]);
  const [orders, setOrders] = useState([]);

  // loading & messages
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState("");

  // shop form state (single shop)
  const [shopForm, setShopForm] = useState({ name: "", phone: "", address: "", pincode: "" });
  const [shopMsg, setShopMsg] = useState("");

  // menu item form (top form, used on desktop / web)
  const [itemForm, setItemForm] = useState({ name: "", price: "", _editingId: null, variants: [] });
  const [itemMsg, setItemMsg] = useState("");

  // inline mobile editor (only used on mobile when editing a specific item)
  const [inlineEditingId, setInlineEditingId] = useState(null);
  const [inlineForm, setInlineForm] = useState({ name: "", price: "", _editingId: null, variants: [] });
  const [inlineMsg, setInlineMsg] = useState("");

  // UI view: "your-shop" | "menu" | "orders"
  const [view, setView] = useState("menu");

  // load merchant shops (single)
  async function loadShop() {
    setLoading(true);
    setMsg("");
    try {
      const res = await apiFetch("/api/me/shops");
      if (!res.ok) {
        if (res.status === 401) {
          localStorage.removeItem("merchant_token");
          navigate("/merchant-login");
        }
        const txt = await res.text();
        throw new Error(txt || `Failed (${res.status})`);
      }
      const data = await res.json();
      if (Array.isArray(data) && data.length > 0) {
        const s = data[0];
        setShop(s);
        setShopForm({
          name: s.name || "",
          phone: s.phone || "",
          address: s.address || "",
          pincode: s.pincode || "",
        });
        await Promise.all([loadMenu(s._id), loadOrders(s._id)]);
      } else {
        setShop(null);
        setMenu([]);
        setOrders([]);
        setMsg("No shop assigned to this merchant.");
      }
    } catch (err) {
      console.error("loadShop", err);
      setMsg("Failed to load shops. Re-login if needed.");
    } finally {
      setLoading(false);
    }
  }

  async function loadMenu(shopId) {
    if (!shopId) { setMenu([]); return; }
    try {
      const res = await apiFetch(`/api/shops/${shopId}/menu`);
      if (!res.ok) throw new Error(`Menu load failed: ${res.status}`);
      const data = await res.json();
      setMenu(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error("loadMenu", err);
      setMsg("Failed to load menu");
    }
  }

  async function loadOrders(shopId) {
    if (!shopId) { setOrders([]); return; }
    try {
      const res = await apiFetch(`/api/shops/${shopId}/orders`);
      if (!res.ok) throw new Error(`Orders load failed: ${res.status}`);
      const data = await res.json();
      setOrders(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error("loadOrders", err);
      setMsg("Failed to load orders");
    }
  }

  useEffect(() => {
    const token = localStorage.getItem("merchant_token");
    if (!token) {
      navigate("/merchant-login");
      return;
    }
    loadShop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- shop save ----
  async function saveShop(e) {
    e && e.preventDefault();
    setShopMsg("");
    if (!shop) { setShopMsg("No shop selected"); return; }
    const { name, phone, address, pincode } = shopForm;
    if (!name || !phone || !address || !pincode) {
      setShopMsg("All fields required");
      return;
    }
    try {
      const res = await apiFetch(`/api/shops/${shop._id}`, {
        method: "PATCH",
        body: { name, phone, address, pincode }
      });
      if (!res.ok) {
        const t = await res.text(); throw new Error(t || "Save failed");
      }
      setShopMsg("Saved");
      await loadShop();
    } catch (err) {
      console.error("saveShop", err);
      setShopMsg("Error: " + (err.message || err));
    }
  }

  // ---- helpers for variants ----
  function hasVariantsFor(form) {
    return Array.isArray(form.variants) && form.variants.length > 0;
  }

  // top form variant helpers (unchanged)
  function addVariantRow() {
    setItemForm(prev => ({ ...prev, variants: [...(prev.variants || []), { id: "", label: "", price: "", available: true }] }));
  }
  function updateVariantAt(index, patch) {
    setItemForm(prev => {
      const vs = Array.isArray(prev.variants) ? [...prev.variants] : [];
      vs[index] = { ...vs[index], ...patch };
      return { ...prev, variants: vs };
    });
  }
  function removeVariantAt(index) {
    setItemForm(prev => {
      const vs = Array.isArray(prev.variants) ? [...prev.variants] : [];
      vs.splice(index, 1);
      return { ...prev, variants: vs };
    });
  }

  // inline form variant helpers (mobile inline editor)
  function inlineAddVariantRow() {
    setInlineForm(prev => ({ ...prev, variants: [...(prev.variants || []), { id: "", label: "", price: "", available: true }] }));
  }
  function inlineUpdateVariantAt(index, patch) {
    setInlineForm(prev => {
      const vs = Array.isArray(prev.variants) ? [...prev.variants] : [];
      vs[index] = { ...vs[index], ...patch };
      return { ...prev, variants: vs };
    });
  }
  function inlineRemoveVariantAt(index) {
    setInlineForm(prev => {
      const vs = Array.isArray(prev.variants) ? [...prev.variants] : [];
      vs.splice(index, 1);
      return { ...prev, variants: vs };
    });
  }

  // ---- submit top form (desktop/web) ----
  async function submitItem(e) {
    e && e.preventDefault();
    setItemMsg("");
    if (!shop) { setItemMsg("Select or create a shop first"); return; }
    if (!itemForm.name || !String(itemForm.name).trim()) { setItemMsg("Item name required"); return; }

    const variants = Array.isArray(itemForm.variants) ? itemForm.variants : [];
    if (variants.length > 0) {
      for (let i = 0; i < variants.length; i++) {
        const v = variants[i];
        if (!v || !v.label || v.label.trim().length === 0) { setItemMsg(`Variant ${i + 1}: label required`); return; }
        const p = Number(v.price || 0);
        if (isNaN(p) || p <= 0) { setItemMsg(`Variant "${v.label || '#' + (i + 1)}" must have price > 0`); return; }
      }
    } else {
      const base = Number(itemForm.price || 0);
      if (isNaN(base) || base <= 0) { setItemMsg("Base price required (when no variants)"); return; }
    }

    try {
      const payload = {
        name: String(itemForm.name).trim(),
        price: hasVariantsFor(itemForm) ? 0 : Number(itemForm.price || 0),
        variants: variants.map((v, idx) => ({
          id: v.id || String(idx + 1),
          label: v.label || v.id || `Option ${idx + 1}`,
          price: Number(v.price || 0),
          available: typeof v.available === "boolean" ? v.available : true
        }))
      };

      if (itemForm._editingId) {
        const res = await apiFetch(`/api/shops/${shop._id}/items/${itemForm._editingId}`, { method: "PATCH", body: payload });
        if (!res.ok) { const t = await res.text(); throw new Error(t || "Edit failed"); }
        setItemMsg("Updated");
      } else {
        const res = await apiFetch(`/api/shops/${shop._id}/items`, { method: "POST", body: payload });
        if (!res.ok) { const t = await res.text(); throw new Error(t || "Add failed"); }
        setItemMsg("Added");
      }

      setItemForm({ name: "", price: "", _editingId: null, variants: [] });
      await loadMenu(shop._id);
    } catch (err) {
      console.error("submitItem", err);
      setItemMsg("Error: " + (err.message || err));
    }
  }

  // ---- inline submit (mobile) ----
  async function submitInline(e) {
    e && e.preventDefault();
    setInlineMsg("");
    if (!shop) { setInlineMsg("Select or create a shop first"); return; }
    if (!inlineForm.name || !String(inlineForm.name).trim()) { setInlineMsg("Item name required"); return; }

    const variants = Array.isArray(inlineForm.variants) ? inlineForm.variants : [];
    if (variants.length > 0) {
      for (let i = 0; i < variants.length; i++) {
        const v = variants[i];
        if (!v || !v.label || v.label.trim().length === 0) { setInlineMsg(`Variant ${i + 1}: label required`); return; }
        const p = Number(v.price || 0);
        if (isNaN(p) || p <= 0) { setInlineMsg(`Variant "${v.label || '#' + (i + 1)}" must have price > 0`); return; }
      }
    } else {
      const base = Number(inlineForm.price || 0);
      if (isNaN(base) || base <= 0) { setInlineMsg("Base price required (when no variants)"); return; }
    }

    try {
      const payload = {
        name: String(inlineForm.name).trim(),
        price: hasVariantsFor(inlineForm) ? 0 : Number(inlineForm.price || 0),
        variants: variants.map((v, idx) => ({
          id: v.id || String(idx + 1),
          label: v.label || v.id || `Option ${idx + 1}`,
          price: Number(v.price || 0),
          available: typeof v.available === "boolean" ? v.available : true
        }))
      };

      if (inlineForm._editingId) {
        const res = await apiFetch(`/api/shops/${shop._id}/items/${inlineForm._editingId}`, { method: "PATCH", body: payload });
        if (!res.ok) { const t = await res.text(); throw new Error(t || "Edit failed"); }
        setInlineMsg("Updated");
        setInlineEditingId(null);
      } else {
        const res = await apiFetch(`/api/shops/${shop._id}/items`, { method: "POST", body: payload });
        if (!res.ok) { const t = await res.text(); throw new Error(t || "Add failed"); }
        setInlineMsg("Added");
      }

      setInlineForm({ name: "", price: "", _editingId: null, variants: [] });
      await loadMenu(shop._id);
    } catch (err) {
      console.error("submitInline", err);
      setInlineMsg("Error: " + (err.message || err));
    }
  }

  // ---- start editing (desktop vs mobile) ----
  function startEditItem(it) {
    // prepare shared payload
    const prepared = {
      name: it.name || "",
      price: String(it.price || ""),
      _editingId: it._id,
      variants: Array.isArray(it.variants) ? it.variants.map(v => ({ id: v.id || "", label: v.label || "", price: String(v.price || ""), available: typeof v.available === "boolean" ? v.available : true })) : []
    };

    if (isMobile) {
      // open inline editor for this item
      setInlineEditingId(it._id);
      setInlineForm(prepared);
      setInlineMsg("");
      // keep top form untouched on mobile
    } else {
      // desktop/web: populate top form (existing behavior)
      setItemMsg("");
      setItemForm(prepared);
      // ensure we stay in menu view
      setView("menu");
    }
  }

  async function deleteItem(id) {
    if (!confirm("Delete this item?")) return;
    try {
      const res = await apiFetch(`/api/shops/${shop._id}/items/${id}`, { method: "DELETE" });
      if (!res.ok) { const t = await res.text(); throw new Error(t || "Delete failed"); }
      // if we removed inline editing target, clear it
      if (inlineEditingId === id) {
        setInlineEditingId(null);
        setInlineForm({ name: "", price: "", _editingId: null, variants: [] });
      }
      await loadMenu(shop._id);
    } catch (err) {
      console.error("deleteItem", err);
      setItemMsg("Delete failed: " + (err.message || err));
    }
  }

  // ---- toggle availability (enable/disable) ----
  async function toggleAvailability(item) {
    setMsg("");
    try {
      const res = await apiFetch(`/api/shops/${shop._id}/items/${item._id}`, {
        method: "PATCH",
        body: { available: !item.available }
      });
      if (!res.ok) {
        const t = await res.text(); throw new Error(t || "Toggle failed");
      }
      await loadMenu(shop._id);
    } catch (err) {
      console.error("toggleAvailability", err);
      setMsg("Toggle failed: " + (err.message || err));
    }
  }

  // ---- orders ----
  async function updateOrderStatus(orderId, newStatus) {
    setMsg("");
    try {
      const res = await apiFetch(`/api/orders/${orderId}/status`, { method: "PATCH", body: { status: newStatus } });
      if (!res.ok) { const t = await res.text(); throw new Error(t || "Update failed"); }
      await loadOrders(shop._id);
      setMsg("Order updated");
    } catch (err) {
      console.error("updateOrderStatus", err);
      setMsg("Failed to update order: " + (err.message || err));
    }
  }

  function displayOrderLabel(o) {
    if (typeof o.orderNumber !== "undefined" && o.orderNumber !== null) return `#${String(o.orderNumber).padStart(6, "0")}`;
    return String(o._id || "").slice(0, 8);
  }

  // ---- render ----
  return (
    <div className="min-h-screen p-4 bg-gray-50">
      <div className="max-w-5xl mx-auto bg-white p-4 rounded shadow">
        <div className="flex justify-between items-center mb-4">
          <div>
            <div className="text-sm text-gray-600">Owner</div>
            <div className="font-semibold">{shop ? (shop.name || "Your Shop") : "No Shop"}</div>
          </div>
          <div className="flex gap-2 items-center">
            <button onClick={() => { localStorage.removeItem("merchant_token"); navigate("/merchant-login"); }} className="px-3 py-1 bg-red-500 text-white rounded">Logout</button>
            <button onClick={() => loadShop()} className="px-3 py-1 bg-gray-200 rounded">Refresh</button>
          </div>
        </div>

        {msg && <div className="mb-3 text-sm text-red-600">{msg}</div>}

        <div className="flex gap-3 mb-4">
          <button onClick={() => setView("your-shop")} className={`px-3 py-1 rounded ${view === "your-shop" ? "bg-gray-900 text-white" : "bg-gray-200"}`}>Your Shop</button>
          <button onClick={() => setView("menu")} className={`px-3 py-1 rounded ${view === "menu" ? "bg-blue-600 text-white" : "bg-gray-200"}`}>Menu</button>
          <button onClick={() => setView("orders")} className={`px-3 py-1 rounded ${view === "orders" ? "bg-blue-600 text-white" : "bg-gray-200"}`}>Orders</button>
        </div>

        {/* YOUR SHOP */}
        {view === "your-shop" && (
          <div className="max-w-lg">
            <h3 className="font-semibold mb-2">Edit Shop</h3>
            <form onSubmit={saveShop} className="space-y-3">
              <input value={shopForm.name} onChange={e => setShopForm(s => ({ ...s, name: e.target.value }))} placeholder="Name" className="w-full p-2 border rounded" />
              <input value={shopForm.phone} onChange={e => setShopForm(s => ({ ...s, phone: e.target.value }))} placeholder="Phone" className="w-full p-2 border rounded" />
              <input value={shopForm.address} onChange={e => setShopForm(s => ({ ...s, address: e.target.value }))} placeholder="Address" className="w-full p-2 border rounded" />
              <input value={shopForm.pincode} onChange={e => setShopForm(s => ({ ...s, pincode: e.target.value }))} placeholder="Pincode" className="w-full p-2 border rounded" />
              <div className="flex gap-2">
                <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded">Save</button>
                <button type="button" onClick={() => { if (shop) setShopForm({ name: shop.name || "", phone: shop.phone || "", address: shop.address || "", pincode: shop.pincode || "" }) }} className="px-4 py-2 bg-gray-200 rounded">Reset</button>
              </div>
              {shopMsg && <div className="text-sm text-gray-700 mt-1">{shopMsg}</div>}
            </form>
          </div>
        )}

        {/* MENU */}
        {view === "menu" && (
          <>
            <div className="mb-4 flex justify-between items-center">
              <h3 className="font-semibold">Menu {shop ? `for ${shop.name}` : ""}</h3>
              <div className="text-sm text-gray-500">{loading ? "Loading..." : ""}</div>
            </div>

            {/* top add/edit item form (desktop / web; still present on mobile but inline editing preferred) */}
            <form onSubmit={submitItem} className="mb-4 grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="md:col-span-2 space-y-2">
                <input value={itemForm.name} onChange={e => setItemForm(prev => ({ ...prev, name: e.target.value }))} placeholder="Item name" className={`w-full p-2 border rounded ${isMobile ? "text-sm" : ""}`} />
                {!hasVariantsFor(itemForm) && <input value={itemForm.price} onChange={e => setItemForm(prev => ({ ...prev, price: e.target.value }))} placeholder="Base Price" type="number" className={`w-40 p-2 border rounded ${isMobile ? "text-sm" : ""}`} />}
                <div className="flex gap-2">
                  <button type="submit" className="px-3 py-1 bg-green-600 text-white rounded">{itemForm._editingId ? "Save" : "Add"}</button>
                  <button type="button" onClick={() => setItemForm({ name: "", price: "", _editingId: null, variants: [] })} className="px-3 py-1 bg-gray-200 rounded">Clear</button>
                  <button type="button" onClick={addVariantRow} className="px-3 py-1 bg-blue-600 text-white rounded">+ Add variant</button>
                </div>
                {itemMsg && <div className="text-sm text-red-600">{itemMsg}</div>}
              </div>

              <div className="bg-white p-3 rounded border">
                <div className="font-medium mb-2">Variants</div>
                {(!itemForm.variants || itemForm.variants.length === 0) ? (
                  <div className="text-sm text-gray-500">No variants</div>
                ) : (
                  <div className="space-y-2 max-h-48 overflow-auto">
                    {itemForm.variants.map((v, i) => (
                      <div key={i} className="flex gap-2 items-center">
                        <input placeholder="Code" value={v.id} onChange={e => updateVariantAt(i, { id: e.target.value })} className="p-1 border rounded w-20" />
                        <input placeholder="Label" value={v.label} onChange={e => updateVariantAt(i, { label: e.target.value })} className="p-1 border rounded flex-1" />
                        <input placeholder="Price" value={v.price} type="number" onChange={e => updateVariantAt(i, { price: e.target.value })} className="p-1 border rounded w-24" />
                        <button type="button" onClick={() => removeVariantAt(i)} className="px-2 py-1 bg-red-100 rounded">Remove</button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </form>

            {/* menu list */}
            <div className="space-y-3">
              {menu.length === 0 ? <div className="text-sm text-gray-500">No menu items</div> : menu.map(it => (
                <div key={it._id} className="bg-white p-3 rounded border">
                  <div className="flex justify-between items-start gap-4">
                    <div className="flex-1">
                      <div className="font-medium">{it.name} • ₹{it.price}</div>
                      <div className="text-xs text-gray-500">{it.available ? "Available" : "Unavailable"}</div>

                      {Array.isArray(it.variants) && it.variants.length > 0 && (
                        <div className="text-sm mt-2">
                          <strong>Variants:</strong>
                          <ul className="ml-4 list-disc">
                            {it.variants.map((v, idx) => (
                              <li key={idx} className="text-sm text-gray-700">
                                <span className="font-medium">{v.label || v.id}</span>
                                {typeof v.price !== 'undefined' && (` — ₹${v.price}`)}
                                {v.available === false && <span className="text-xs text-red-600 ml-2"> (disabled)</span>}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>

                    <div className="flex flex-col items-end gap-2">
                      <button onClick={() => toggleAvailability(it)} className={`px-3 py-1 rounded text-sm ${it.available ? "bg-green-100 text-green-800" : "bg-gray-200 text-gray-700"}`}>
                        {it.available ? "Enabled" : "Disabled"}
                      </button>

                      <div className="flex gap-2">
                        <button onClick={() => startEditItem(it)} className="px-3 py-1 bg-yellow-400 rounded">Edit</button>
                        <button onClick={() => deleteItem(it._id)} className="px-3 py-1 bg-gray-200 rounded">Delete</button>
                      </div>
                    </div>
                  </div>

                  {/* INLINE MOBILE EDITOR — only visible when inlineEditingId === this item and on mobile */}
                  {isMobile && inlineEditingId === it._id && (
                    <div className="mt-3 bg-gray-50 border rounded p-3">
                      <form onSubmit={submitInline} className="space-y-2">
                        <div>
                          <input value={inlineForm.name} onChange={e => setInlineForm(prev => ({ ...prev, name: e.target.value }))} placeholder="Item name" className="w-full p-2 border rounded text-sm" />
                        </div>
                        <div className="flex gap-2">
                          <input value={inlineForm.price} onChange={e => setInlineForm(prev => ({ ...prev, price: e.target.value }))} placeholder="Base price" type="number" className="p-2 border rounded w-28 text-sm" disabled={hasVariantsFor(inlineForm)} />
                          <div className="flex gap-2">
                            <button type="submit" className="px-3 py-1 bg-blue-600 text-white rounded text-sm">Save</button>
                            <button type="button" onClick={() => { setInlineEditingId(null); setInlineForm({ name: "", price: "", _editingId: null, variants: [] }); setInlineMsg(""); }} className="px-3 py-1 bg-gray-200 rounded text-sm">Cancel</button>
                          </div>
                        </div>

                        <div className="bg-white p-2 rounded border">
                          <div className="flex items-center justify-between mb-2">
                            <div className="text-sm font-medium">Variants</div>
                            <button type="button" onClick={inlineAddVariantRow} className="px-2 py-1 bg-blue-600 text-white rounded text-sm">+ Add</button>
                          </div>

                          <div className="space-y-2 max-h-40 overflow-auto">
                            {(!inlineForm.variants || inlineForm.variants.length === 0) ? (
                              <div className="text-xs text-gray-500">No variants (leave empty to use base price)</div>
                            ) : inlineForm.variants.map((v, idx) => (
                              <div key={idx} className="grid grid-cols-12 gap-2 items-center">
                                <div className="col-span-3">
                                  <input value={v.id} onChange={e => inlineUpdateVariantAt(idx, { id: e.target.value })} placeholder="Code" className="p-1 border rounded w-full text-sm" />
                                </div>
                                <div className="col-span-5">
                                  <input value={v.label} onChange={e => inlineUpdateVariantAt(idx, { label: e.target.value })} placeholder="Label" className="p-1 border rounded w-full text-sm" />
                                </div>
                                <div className="col-span-2">
                                  <input value={v.price} onChange={e => inlineUpdateVariantAt(idx, { price: e.target.value })} placeholder="Price" type="number" className="p-1 border rounded w-full text-sm" />
                                </div>
                                <div className="col-span-1">
                                  <button type="button" onClick={() => inlineRemoveVariantAt(idx)} className="px-2 py-1 bg-red-100 rounded text-sm">Remove</button>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>

                        {inlineMsg && <div className="text-sm text-red-600">{inlineMsg}</div>}
                      </form>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </>
        )}

        {/* ORDERS */}
        {view === "orders" && (
          <>
            <h3 className="font-semibold mb-3">Orders {shop ? `for ${shop.name}` : ""}</h3>
            {orders.length === 0 ? <div className="text-sm text-gray-500">No orders</div> : (
              <div className="space-y-3">
                {orders.map(o => {
                  const status = (o.status || "").toLowerCase();
                  return (
                    <div key={o._id} className="bg-white p-3 rounded border flex justify-between items-center">
                      <div>
                        <div className="font-medium">{displayOrderLabel(o)} — <span className="text-sm text-gray-600">{status}</span></div>
                        <div className="text-sm text-gray-600">{o.items.map(i => `${i.name} x${i.qty}`).join(", ")}</div>
                        <div className="text-sm text-gray-600">₹{o.total}</div>
                      </div>
                      <div className="flex flex-col items-end gap-2">
                        <div className="text-sm">Customer: <b>{o.customerName}</b></div>
                        <div className="flex gap-2">
                          <button onClick={() => updateOrderStatus(o._id, "accepted")} disabled={status !== "received"} className={`px-3 py-1 rounded ${status === "received" ? "bg-blue-600 text-white" : "bg-gray-200"}`}>Accept</button>
                          <button onClick={() => updateOrderStatus(o._id, "packed")} disabled={status !== "accepted"} className={`px-3 py-1 rounded ${status === "accepted" ? "bg-yellow-500 text-white" : "bg-gray-200"}`}>Packed</button>
                          <button onClick={() => updateOrderStatus(o._id, "out-for-delivery")} disabled={status !== "packed"} className={`px-3 py-1 rounded ${status === "packed" ? "bg-indigo-600 text-white" : "bg-gray-200"}`}>Out</button>
                          <button onClick={() => updateOrderStatus(o._id, "delivered")} disabled={status !== "out-for-delivery"} className={`px-3 py-1 rounded ${status === "out-for-delivery" ? "bg-green-600 text-white" : "bg-gray-200"}`}>Delivered</button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>

      {/* optional mobile bottom nav if you have one */}
      {isMobile && <MobileBottomNav active="owner" />}
    </div>
  );
}
