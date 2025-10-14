// services/owner-frontend/src/pages/OwnerDashboard.jsx
import React, { useEffect, useState, useRef } from "react";
import { apiFetch, getApiBase } from "../hooks/useApi";
import { useNavigate } from "react-router-dom";
import useWindowSize from "../hooks/useWindowSize";
import MobileBottomNav from "../components/MobileBottomNav";

/**
 * OwnerDashboard — inline editor + delete + enable/disable preserved.
 * Buttons moved to the bottom-right of each item card so top area can host an image later.
 * Inline editor opens under the item and takes full width on mobile.
 * No logic changes except adding small image-upload UI (local dev flow).
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

  // top add/edit item form (kept)
  const [itemForm, setItemForm] = useState({ name: "", price: "", _editingId: null, variants: [] });
  const [itemMsg, setItemMsg] = useState("");

  // inline edit state
  const [editingItemId, setEditingItemId] = useState(null);
  const [editingForm, setEditingForm] = useState({ name: "", price: "", _editingId: null, variants: [] });
  const [editingMsg, setEditingMsg] = useState("");

  // UI view
  const [view, setView] = useState("menu");

  // ---- load shop/menu/orders ----
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

  // ---- helpers ----
  function hasVariantsFor(form) {
    return Array.isArray(form.variants) && form.variants.length > 0;
  }

  // top add form functions (unchanged)
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

  // ---- inline edit helpers ----
  function openInlineEdit(item) {
    setEditingMsg("");
    const itemId = item._id || item.id;
    setEditingItemId(itemId);
    setEditingForm({
      name: item.name || "",
      price: String(item.price || ""),
      _editingId: itemId,
      variants: Array.isArray(item.variants) ? item.variants.map(v => ({ id: v.id || "", label: v.label || "", price: String(v.price || ""), available: typeof v.available === "boolean" ? v.available : true })) : []
    });
    setTimeout(() => {
      const el = document.getElementById(`menu-item-${itemId}`);
      if (el && el.scrollIntoView) el.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 120);
  }

  function inlineAddVariantRow() {
    setEditingForm(prev => ({ ...prev, variants: [...(prev.variants || []), { id: "", label: "", price: "", available: true }] }));
  }
  function inlineUpdateVariantAt(index, patch) {
    setEditingForm(prev => {
      const vs = Array.isArray(prev.variants) ? [...prev.variants] : [];
      vs[index] = { ...vs[index], ...patch };
      return { ...prev, variants: vs };
    });
  }
  function inlineRemoveVariantAt(index) {
    setEditingForm(prev => {
      const vs = Array.isArray(prev.variants) ? [...prev.variants] : [];
      vs.splice(index, 1);
      return { ...prev, variants: vs };
    });
  }

  async function submitInlineEdit(e) {
    e && e.preventDefault();
    setEditingMsg("");
    if (!shop) { setEditingMsg("No shop"); return; }
    if (!editingForm.name || !String(editingForm.name).trim()) { setEditingMsg("Item name required"); return; }

    const variants = Array.isArray(editingForm.variants) ? editingForm.variants : [];
    if (variants.length > 0) {
      for (let i = 0; i < variants.length; i++) {
        const v = variants[i];
        if (!v || !v.label || v.label.trim().length === 0) { setEditingMsg(`Variant ${i + 1}: label required`); return; }
        const p = Number(v.price || 0);
        if (isNaN(p) || p <= 0) { setEditingMsg(`Variant "${v.label || '#' + (i + 1)}" must have price > 0`); return; }
      }
    } else {
      const base = Number(editingForm.price || 0);
      if (isNaN(base) || base <= 0) { setEditingMsg("Base price required (when no variants)"); return; }
    }

    try {
      const payload = {
        name: String(editingForm.name).trim(),
        price: hasVariantsFor(editingForm) ? 0 : Number(editingForm.price || 0),
        variants: variants.map((v, idx) => ({
          id: v.id || String(idx + 1),
          label: v.label || v.id || `Option ${idx + 1}`,
          price: Number(v.price || 0),
          available: typeof v.available === "boolean" ? v.available : true
        }))
      };

      const res = await apiFetch(`/api/shops/${shop._id}/items/${editingForm._editingId}`, { method: "PATCH", body: payload });
      if (!res.ok) { const t = await res.text(); throw new Error(t || "Edit failed"); }
      setEditingMsg("Updated");
      setEditingItemId(null);
      setEditingForm({ name: "", price: "", _editingId: null, variants: [] });
      await loadMenu(shop._id);
    } catch (err) {
      console.error("submitInlineEdit", err);
      setEditingMsg("Error: " + (err.message || err));
    }
  }

  function cancelInlineEdit() {
    setEditingItemId(null);
    setEditingForm({ name: "", price: "", _editingId: null, variants: [] });
    setEditingMsg("");
  }

  function startEditItem(it) {
    openInlineEdit(it);
    setView("menu");
  }

  async function deleteItem(idOrObj) {
    const id = typeof idOrObj === 'string' ? idOrObj : (idOrObj && (idOrObj._id || idOrObj.id));
    if (!id) { setItemMsg('Delete failed: no id'); return; }
    if (!confirm("Delete this item?")) return;
    try {
      const res = await apiFetch(`/api/shops/${shop._id}/items/${id}`, { method: "DELETE" });
      if (!res.ok) { const t = await res.text(); throw new Error(t || "Delete failed"); }
      await loadMenu(shop._id);
    } catch (err) {
      console.error("deleteItem", err);
      setItemMsg("Delete failed: " + (err.message || err));
    }
  }

  async function toggleAvailability(itOrId) {
    const item = typeof itOrId === 'string' ? menu.find(m => (m._id === itOrId || m.id === itOrId)) : itOrId;
    const id = item && (item._id || item.id);
    if (!id) { setItemMsg('Toggle failed: no id'); return; }
    try {
      const res = await apiFetch(`/api/shops/${shop._id}/items/${id}`, { method: "PATCH", body: { available: !item.available } });
      if (!res.ok) { const t = await res.text(); throw new Error(t || "Toggle failed"); }
      await loadMenu(shop._id);
    } catch (err) {
      console.error("toggleAvailability", err);
      setItemMsg("Error: " + (err.message || err));
    }
  }

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

  // -----------------------
  // Image upload helpers
  // -----------------------
  // Cloudinary-only uploader:
  //  - POST multipart/form-data to /api/upload-cloud/:itemId  (Cloudinary route on backend)

  //  - Expect JSON { imageUrl: "/uploads/..." } (or full URL)
  // After uploading, persist to item record by POST /api/shops/:shopId/items/:itemId/image { imageUrl }
  //
  // If you want S3 presign later, replace ItemImageUpload.uploadToLocal with presign flow.

  function ItemImageUpload({ item, onUploaded }) {
    // local hidden input
    const fileRef = useRef(null);
    const [busy, setBusy] = useState(false);

    // replace your uploadToLocal & onFilePicked with this safer version
    // ----- paste / replace these helpers inside your component -----

    // helper to get token from localStorage (adjust key if you store it differently)
    function getMerchantToken() {
      return localStorage.getItem("merchant_token") || "";
    }

    // upload file (multipart) to backend and return imageUrl string
    async function uploadToCloud(file, item) {
      const form = new FormData();
      form.append("image", file);

      const token = getMerchantToken();
      if (!item || (!item._id && !item.id)) {
        throw new Error("uploadToLocal called without a valid item object");
      }

      const url = `${API_BASE.replace(/\/$/, "")}/api/upload-cloud/${item._id || item.id}`;



      const headers = {};
      if (token) headers["Authorization"] = `Bearer ${token}`;

      const res = await fetch(url, {
        method: "POST",
        body: form,
        headers,             // Authorization header only (do NOT set Content-Type)
        credentials: "include"
      });

      // If unauthorized, throw helpful error
      if (res.status === 401 || res.status === 403) {
        const txt = await res.text().catch(() => "");
        throw new Error(`Unauthorized. Backend returned ${res.status}. ${txt}`);
      }

      const ct = res.headers.get("content-type") || "";
      if (ct.includes("application/json")) {
        const json = await res.json();
        if (!json || !json.imageUrl) throw new Error("Upload succeeded but server did not return imageUrl");
        return json.imageUrl;
      } else {
        // read text for debug
        const txt = await res.text().catch(() => "");
        throw new Error(`Upload failed (status ${res.status}). Server returned non-JSON response: ${txt.slice(0, 200)}`);
      }
    }

    // persist imageUrl into the MenuItem DB record
    async function persistImageUrl(shopId, itemId, imageUrl) {
      if (!imageUrl) throw new Error("imageUrl required to persist");
      const token = getMerchantToken();
      const url = `${API_BASE.replace(/\/$/, "")}/api/shops/${shopId}/items/${itemId}/image`;
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { "Authorization": `Bearer ${token}` } : {})
        },
        body: JSON.stringify({ imageUrl })
      });

      // helpful checks
      const text = await res.text().catch(() => "");
      if (!res.ok) {
        throw new Error(`Persist image failed (status ${res.status}): ${text.slice(0, 200)}`);
      }
      try {
        const j = JSON.parse(text || "{}");
        return j;
      } catch (e) {
        // server returned empty or non-JSON but status OK
        return { imageUrl };
      }
    }

    // call these from your file input handler
    async function onFilePicked(e, item) {
      const file = e.target.files?.[0];
      if (!file) return;
      if (!item || (!item._id && !item.id)) {
        alert("No valid item found for upload");
        return;
      }
      try {
        const imageUrl = await uploadToCloud(file, item);
        // then persist on the item record
        await persistImageUrl(item.shop || shop._id, item._id || item.id, imageUrl);
        // refresh menu or update local UI
        await loadMenu(shop._id);
        alert("Image uploaded and saved");
      } catch (err) {
        console.error("Image upload error", err);
        alert("Image upload failed: " + (err.message || err));
      } finally {
        if (e.target) e.target.value = "";
      }
    }



    return (
      <div className="w-20 h-20 flex items-center justify-center rounded-md border border-dashed overflow-hidden relative">
        {/* thumbnail if present */}
        {item.imageUrl ? (
          <img src={item.imageUrl} alt={item.name || "item-img"} className="w-full h-full object-cover" />
        ) : (
          <button
            onClick={() => fileRef.current && fileRef.current.click()}
            aria-label="Upload image"
            className="w-full h-full flex items-center justify-center p-1"
            title="Upload image"
          >
            {/* basic upload + plus icon */}
            <svg width="34" height="34" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <rect x="2" y="3" width="20" height="14" rx="2" stroke="currentColor" strokeWidth="1.5" />
              <circle cx="7" cy="7" r="1.5" fill="currentColor" />
              <path d="M12 11V6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              <path d="M9 9l3-3 3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M18 19H6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        )}

        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => onFilePicked(e, item)} />
        {busy && <div className="absolute inset-0 bg-white/60 flex items-center justify-center text-sm">Uploading...</div>}
      </div>
    );
  }

  // Called when ItemImageUpload finishes uploading and returns imageUrl
  async function handleImageUploaded(itemId, imageUrl) {
    if (!shop) return;
    // update UI immediately
    setMenu(prev => prev.map(it => ((it._id === itemId || it.id === itemId) ? { ...it, imageUrl } : it)));

    // persist association on backend if endpoint exists
    try {
      // attempt to notify backend (endpoint should accept JSON { imageUrl })
      await apiFetch(`/api/shops/${shop._id}/items/${itemId}/image`, {
        method: "POST",
        body: { imageUrl }
      });
      // refresh menu to ensure consistency (optional)
      await loadMenu(shop._id);
    } catch (err) {
      console.warn("Could not persist imageUrl to backend:", err);
    }
  }

  // -----------------------
  // Render
  // -----------------------
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="w-full sm:max-w-5xl mx-auto bg-white sm:p-4 p-2 rounded sm:rounded shadow">
        <div className="flex justify-between items-center mb-4">
          <div>
            <div className="text-sm text-gray-600">Owner</div>
            <div className="font-semibold text-base">{shop ? (shop.name || "Your Shop") : "No Shop"}</div>
          </div>
          <div className="flex gap-2 items-center">
            <button onClick={() => { localStorage.removeItem("merchant_token"); navigate("/merchant-login"); }} className="px-2 py-1 bg-red-500 text-white rounded text-sm">Logout</button>
            <button onClick={() => loadShop()} className="px-2 py-1 bg-gray-200 rounded text-sm">Refresh</button>
          </div>
        </div>

        {msg && <div className="mb-3 text-sm text-red-600">{msg}</div>}

        <div className="flex gap-2 mb-4">
          <button onClick={() => setView("your-shop")} className={`px-3 py-1 rounded text-sm ${view === "your-shop" ? "bg-gray-900 text-white" : "bg-gray-200"}`}>Your Shop</button>
          <button onClick={() => setView("menu")} className={`px-3 py-1 rounded text-sm ${view === "menu" ? "bg-blue-600 text-white" : "bg-gray-200"}`}>Menu</button>
          <button onClick={() => setView("orders")} className={`px-3 py-1 rounded text-sm ${view === "orders" ? "bg-blue-600 text-white" : "bg-gray-200"}`}>Orders</button>
        </div>

        {/* YOUR SHOP */}
        {view === "your-shop" && (
          <div className="max-w-md">
            <h3 className="font-semibold mb-2">Edit Shop</h3>
            <form onSubmit={saveShop} className="space-y-3">
              <input value={shopForm.name} onChange={e => setShopForm(s => ({ ...s, name: e.target.value }))} placeholder="Name" className="w-full p-2 border rounded text-sm" />
              <input value={shopForm.phone} onChange={e => setShopForm(s => ({ ...s, phone: e.target.value }))} placeholder="Phone" className="w-full p-2 border rounded text-sm" />
              <input value={shopForm.address} onChange={e => setShopForm(s => ({ ...s, address: e.target.value }))} placeholder="Address" className="w-full p-2 border rounded text-sm" />
              <input value={shopForm.pincode} onChange={e => setShopForm(s => ({ ...s, pincode: e.target.value }))} placeholder="Pincode" className="w-full p-2 border rounded text-sm" />
              <div className="flex flex-wrap gap-2">
                <button type="submit" className="px-3 py-1 bg-blue-600 text-white rounded text-sm">Save</button>
                <button type="button" onClick={() => { if (shop) setShopForm({ name: shop.name || "", phone: shop.phone || "", address: shop.address || "", pincode: shop.pincode || "" }) }} className="px-3 py-1 bg-gray-200 rounded text-sm">Reset</button>
              </div>
              {shopMsg && <div className="text-sm text-gray-700 mt-1">{shopMsg}</div>}
            </form>
          </div>
        )}

        {/* MENU */}
        {view === "menu" && (
          <>
            <div className="mb-3 flex justify-between items-center">
              <h3 className="font-semibold">Menu {shop ? `for ${shop.name}` : ""}</h3>
              <div className="text-sm text-gray-500">{loading ? "Loading..." : ""}</div>
            </div>

            {/* top add/edit form (kept but responsive) */}
            <form onSubmit={submitItem} className="mb-4 grid grid-cols-1 md:grid-cols-3 gap-3 items-start">
              <div className="md:col-span-2 space-y-2">
                <input value={itemForm.name} onChange={e => setItemForm(prev => ({ ...prev, name: e.target.value }))} placeholder="Item name" className="w-full p-2 border rounded text-sm" />
                {!hasVariantsFor(itemForm) && <input value={itemForm.price} onChange={e => setItemForm(prev => ({ ...prev, price: e.target.value }))} placeholder="Base Price" type="number" className="w-full md:w-40 p-2 border rounded text-sm" />}
                <div className="flex flex-wrap gap-2">
                  <button type="submit" className="px-3 py-1 bg-green-600 text-white rounded text-sm">Add</button>
                  <button type="button" onClick={() => setItemForm({ name: "", price: "", _editingId: null, variants: [] })} className="px-3 py-1 bg-gray-200 rounded text-sm">Clear</button>
                  <button type="button" onClick={addVariantRow} className="px-3 py-1 bg-blue-600 text-white rounded text-sm">+ Add variant</button>
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
                        <input placeholder="Code" value={v.id} onChange={e => updateVariantAt(i, { id: e.target.value })} className="p-1 border rounded w-20 text-sm" />
                        <input placeholder="Label" value={v.label} onChange={e => updateVariantAt(i, { label: e.target.value })} className="p-1 border rounded flex-1 text-sm" />
                        <input placeholder="Price" value={v.price} type="number" onChange={e => updateVariantAt(i, { price: e.target.value })} className="p-1 border rounded w-24 text-sm" />
                        <button type="button" onClick={() => removeVariantAt(i)} className="px-2 py-1 bg-red-100 rounded text-sm">Remove</button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </form>

            {menu.length === 0 ? (
              <div className="text-sm text-gray-500">No menu items</div>
            ) : (
              <div className="space-y-3">
                {menu.map(it => {
                  const itemId = it._id || it.id;
                  return (
                    <div key={itemId} id={`menu-item-${itemId}`} className="bg-white p-3 rounded border">
                      {/* Top area — name / availability / variants (room for image above later) */}
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="font-medium">{it.name} • ₹{it.price}</div>
                          <div className="text-xs text-gray-500">{it.available ? "Available" : "Unavailable"}</div>

                          {Array.isArray(it.variants) && it.variants.length > 0 && (
                            <div className="text-sm mt-2">
                              <strong>Variants:</strong>
                              <ul className="mt-1 ml-4 list-disc">
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

                        {/* Right reserved area for image / upload button (keeps layout stable) */}
                        <div className="ml-4">
                          <ItemImageUpload item={it} onUploaded={(imageUrl) => handleImageUploaded(itemId, imageUrl)} />
                        </div>
                      </div>

                      {/* Inline editor under item (if opened) */}
                      {editingItemId === itemId && (
                        <div className="mt-3 bg-gray-50 p-3 rounded border">
                          <form onSubmit={submitInlineEdit} className="space-y-3">
                            <div className="flex flex-col md:flex-row md:items-start md:gap-3">
                              <input value={editingForm.name} onChange={e => setEditingForm(prev => ({ ...prev, name: e.target.value }))} placeholder="Item name" className="w-full p-2 border rounded text-sm" />
                              <input value={editingForm.price} onChange={e => setEditingForm(prev => ({ ...prev, price: e.target.value }))} placeholder="Base Price" type="number" className={`w-full md:w-40 p-2 border rounded text-sm ${hasVariantsFor(editingForm) ? "bg-gray-100" : ""}`} disabled={hasVariantsFor(editingForm)} />
                            </div>

                            <div className="flex flex-wrap gap-2">
                              <button type="submit" className="px-3 py-1 bg-blue-600 text-white rounded text-sm">Save</button>
                              <button type="button" onClick={cancelInlineEdit} className="px-3 py-1 bg-gray-200 rounded text-sm">Cancel</button>
                              <button type="button" onClick={inlineAddVariantRow} className="px-3 py-1 bg-blue-600 text-white rounded text-sm">+ Add variant</button>
                            </div>

                            <div className="bg-white p-2 rounded border">
                              <div className="font-medium mb-2">Variants</div>
                              {(!editingForm.variants || editingForm.variants.length === 0) ? (
                                <div className="text-sm text-gray-500">No variants</div>
                              ) : (
                                <div className="space-y-2">
                                  {editingForm.variants.map((v, i) => (
                                    <div key={i} className="grid grid-cols-12 gap-2 items-center">
                                      <div className="col-span-3 sm:col-span-2">
                                        <input placeholder="Code" value={v.id} onChange={e => inlineUpdateVariantAt(i, { id: e.target.value })} className="p-1 border rounded w-full text-sm" />
                                      </div>
                                      <div className="col-span-6 sm:col-span-7">
                                        <input placeholder="Label" value={v.label} onChange={e => inlineUpdateVariantAt(i, { label: e.target.value })} className="p-1 border rounded w-full text-sm" />
                                      </div>
                                      <div className="col-span-3 sm:col-span-3 flex items-center gap-2">
                                        <input placeholder="Price" value={v.price} type="number" onChange={e => inlineUpdateVariantAt(i, { price: e.target.value })} className="p-1 border rounded w-full text-sm" />
                                        <button type="button" onClick={() => inlineRemoveVariantAt(i)} className="px-2 py-1 bg-red-100 rounded text-sm">x</button>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>

                            {editingMsg && <div className="text-sm text-red-600">{editingMsg}</div>}
                          </form>
                        </div>
                      )}

                      {/* Buttons moved to bottom-right of card (space freed above for image) */}
                      <div className="mt-3 flex justify-end">
                        <div className="flex gap-2 items-center flex-wrap">
                          <button
                            onClick={() => toggleAvailability(it)}
                            className={`px-2 py-1 rounded text-sm ${it.available ? "bg-green-100 text-green-800" : "bg-gray-200 text-gray-700"}`}
                          >
                            {it.available ? "Enabled" : "Disabled"}
                          </button>

                          <button onClick={() => startEditItem(it)} className="px-2 py-1 bg-yellow-400 rounded text-sm">Edit</button>

                          <button onClick={() => deleteItem(itemId)} className="px-2 py-1 bg-gray-200 rounded text-sm">Delete</button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
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

      {isMobile && typeof MobileBottomNav !== "undefined" && <MobileBottomNav />}
    </div>
  );
}
