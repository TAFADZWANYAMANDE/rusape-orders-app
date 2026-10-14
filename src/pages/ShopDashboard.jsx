import { useEffect, useState, useCallback, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { useNavigate } from 'react-router-dom'
import { APP_NAME } from '../config'

const WHATSAPP_NUMBER = '263787848945'

function formatFirstName(fullName) {
  if (!fullName || !fullName.trim()) return ''
  const firstWord = fullName.trim().split(/\s+/)[0]
  return firstWord.charAt(0).toUpperCase() + firstWord.slice(1).toLowerCase()
}

const STATUS_CONFIG = {
  pending: { label: 'Waiting for supplier', bg: '#FEF3C7', color: '#92400E', border: '#F59E0B' },
  accepted: { label: 'Accepted', bg: '#DCFCE7', color: '#166534', border: '#22C55E' },
  rejected: { label: 'Declined', bg: '#FEE2E2', color: '#991B1B', border: '#EF4444' },
  ready: { label: 'Ready', bg: '#DBEAFE', color: '#1D4ED8', border: '#60A5FA' },
  delivered: { label: 'Delivered', bg: '#ECFDF5', color: '#065F46', border: '#10B981' },
  completed: { label: 'Completed', bg: '#E0F2FE', color: '#0F766E', border: '#2DD4BF' },
  cancelled: { label: 'Cancelled', bg: '#F3F4F6', color: '#4B5563', border: '#9CA3AF' },
}

const EMPTY_CART = { supplierId: null, supplierName: '', supplierPhone: '', items: [] }
const PAGE_SIZE = 20

export default function ShopDashboard() {
  const navigate = useNavigate()
  const [user, setUser] = useState(null)
  const [profile, setProfile] = useState(null)
  const [profileLoading, setProfileLoading] = useState(true)

  // Current active tab: 'shop', 'cart', 'orders'
  const [activeTab, setActiveTab] = useState('shop')

  // --- Cart State ---
  const [cart, setCart] = useState(EMPTY_CART)
  const [cartHydrated, setCartHydrated] = useState(false)
  const [cartNote, setCartNote] = useState('')
  const [cartNotice, setCartNotice] = useState('')
  const [conflictPrompt, setConflictPrompt] = useState(null)

  // --- Shop Profile Completion for checkout ---
  const [shopBusinessName, setShopBusinessName] = useState('')
  const [shopPhone, setShopPhone] = useState('')
  const [savingShopProfile, setSavingShopProfile] = useState(false)
  const [profileFormError, setProfileFormError] = useState('')

  // --- Checkout & Order placement state ---
  const [isConfirmingOrder, setIsConfirmingOrder] = useState(false)
  const [isPlacingOrder, setIsPlacingOrder] = useState(false)
  const [checkoutError, setCheckoutError] = useState('')
  const [lastPlacedOrder, setLastPlacedOrder] = useState(null)

  // --- Suppliers Directory State ---
  const [suppliers, setSuppliers] = useState([])
  const [suppliersLoading, setSuppliersLoading] = useState(true)
  const [suppliersError, setSuppliersError] = useState('')
  const [supplierSearch, setSupplierSearch] = useState('')
  const suppliersRef = useRef([])

  // --- Selected Supplier Catalogue State ---
  const [activeSupplier, setActiveSupplier] = useState(null)
  const [products, setProducts] = useState([])
  const [productsLoading, setProductsLoading] = useState(false)
  const [productsError, setProductsError] = useState('')
  const [productSearch, setProductSearch] = useState('')
  const [stepperValues, setStepperValues] = useState({})

  // --- My Orders State ---
  const [orders, setOrders] = useState([])
  const [ordersLoading, setOrdersLoading] = useState(false)
  const [ordersError, setOrdersError] = useState('')
  const [ordersPage, setOrdersPage] = useState(0)
  const [hasMoreOrders, setHasMoreOrders] = useState(true)
  const [expandedOrders, setExpandedOrders] = useState({})
  const [confirmingOrderId, setConfirmingOrderId] = useState(null)

  // Re-verify cart items against database: drop deleted / out of stock items, refresh prices
  const verifyCartProducts = useCallback(async (savedCart) => {
    if (!savedCart.items || savedCart.items.length === 0) return
    const ids = savedCart.items.map((i) => i.productId)
    const { data: currentProducts, error } = await supabase
      .from('products')
      .select('id, name, price, unit, in_stock')
      .in('id', ids)

    if (error || !currentProducts) return

    const productMap = new Map(currentProducts.map((p) => [p.id, p]))
    const verifiedItems = []
    let removedCount = 0
    let priceChangedCount = 0

    for (const item of savedCart.items) {
      const current = productMap.get(item.productId)
      if (current && current.in_stock !== false) {
        const newPrice = Number(current.price)
        if (newPrice !== item.price) priceChangedCount += 1
        verifiedItems.push({
          ...item,
          name: current.name,
          price: newPrice,
          unit: current.unit,
        })
      } else {
        removedCount += 1
      }
    }

    setCart({
      supplierId: verifiedItems.length > 0 ? savedCart.supplierId : null,
      supplierName: verifiedItems.length > 0 ? savedCart.supplierName : '',
      supplierPhone: verifiedItems.length > 0 ? savedCart.supplierPhone : '',
      items: verifiedItems,
    })

    const notes = []
    if (removedCount > 0) {
      notes.push(
        `${removedCount} item${removedCount > 1 ? 's were' : ' was'} removed because ${
          removedCount > 1 ? 'they are' : 'it is'
        } no longer available.`
      )
    }
    if (priceChangedCount > 0) {
      notes.push(
        `${priceChangedCount} price${priceChangedCount > 1 ? 's were' : ' was'} updated.`
      )
    }
    if (notes.length > 0) setCartNotice(notes.join(' '))
  }, [])

  // Load Suppliers
  const loadSuppliers = useCallback(async () => {
    setSuppliersLoading(true)
    setSuppliersError('')
    const { data, error } = await supabase
      .from('supplier_directory')
      .select('id, display_name, phone')

    if (error) {
      setSuppliersError('Could not load suppliers. Please check your connection.')
    } else {
      const list = data || []
      suppliersRef.current = list
      setSuppliers(list)
    }
    setSuppliersLoading(false)
  }, [])

  // 1. Load user, profile and restore cart from localStorage
  useEffect(() => {
    let cancelled = false

    async function init() {
      try {
        const {
          data: { user: authUser },
        } = await supabase.auth.getUser()

        if (cancelled) return
        if (!authUser) {
          navigate('/login')
          return
        }
        setUser(authUser)

        const { data: profileData } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', authUser.id)
          .maybeSingle()

        if (cancelled) return
        if (profileData) {
          setProfile(profileData)
          setShopBusinessName(profileData.business_name || '')
          setShopPhone(profileData.phone || '')
        }

        // Restore cart
        try {
          const stored = localStorage.getItem(`stocklink_cart_${authUser.id}`)
          if (stored) {
            const parsed = JSON.parse(stored)
            if (parsed && Array.isArray(parsed.items) && parsed.items.length > 0) {
              setCart(parsed)
              verifyCartProducts(parsed)
            }
          }
        } catch {
          // Ignore localStorage / JSON errors
        }
        setCartHydrated(true)
      } catch {
        // Network failure: still let the page render
      } finally {
        if (!cancelled) setProfileLoading(false)
      }

      if (!cancelled) loadSuppliers()
    }

    init()
    return () => {
      cancelled = true
    }
  }, [navigate, verifyCartProducts, loadSuppliers])

  // 2. Persist cart whenever it changes (only after the saved cart has been restored)
  useEffect(() => {
    if (!user || !cartHydrated) return
    try {
      if (cart.items.length === 0) {
        localStorage.removeItem(`stocklink_cart_${user.id}`)
      } else {
        localStorage.setItem(`stocklink_cart_${user.id}`, JSON.stringify(cart))
      }
    } catch {
      // Ignore quota error
    }
  }, [cart, user, cartHydrated])

  // Load Catalogue for a chosen Supplier
  async function openSupplierCatalogue(supplier) {
    setActiveSupplier(supplier)
    setProductsLoading(true)
    setProductsError('')
    setProductSearch('')

    const { data, error } = await supabase
      .from('products')
      .select('id, supplier_id, name, price, unit, in_stock, created_at')
      .eq('supplier_id', supplier.id)
      .order('name', { ascending: true })

    if (error) {
      setProductsError('Failed to load catalogue. Please check connection.')
    } else {
      setProducts(data || [])
    }
    setProductsLoading(false)
  }

  function handleBackToSuppliers() {
    setActiveSupplier(null)
    setProducts([])
    setProductSearch('')
  }

  // Cart quantity helpers
  function getCartItemQty(productId) {
    const item = cart.items.find((i) => i.productId === productId)
    return item ? item.quantity : 0
  }

  function handleQuantityChange(productId, val) {
    const num = parseInt(val, 10)
    if (isNaN(num) || num < 1) {
      setStepperValues((prev) => ({ ...prev, [productId]: 1 }))
    } else if (num > 999) {
      setStepperValues((prev) => ({ ...prev, [productId]: 999 }))
    } else {
      setStepperValues((prev) => ({ ...prev, [productId]: num }))
    }
  }

  function handleAddToCart(product) {
    const qty = stepperValues[product.id] || 1

    // Cart already has items from a different supplier
    if (cart.items.length > 0 && cart.supplierId && cart.supplierId !== activeSupplier.id) {
      setConflictPrompt({
        currentSupplierName: cart.supplierName || 'another supplier',
        newSupplier: activeSupplier,
        newProduct: product,
        newQty: qty,
      })
      return
    }

    const supplier = activeSupplier
    setCart((prev) => {
      const existingIndex = prev.items.findIndex((i) => i.productId === product.id)
      let nextItems
      if (existingIndex >= 0) {
        nextItems = prev.items.map((item, idx) =>
          idx === existingIndex
            ? { ...item, quantity: Math.min(999, item.quantity + qty) }
            : item
        )
      } else {
        nextItems = [
          ...prev.items,
          {
            productId: product.id,
            name: product.name,
            price: Number(product.price),
            unit: product.unit,
            quantity: qty,
          },
        ]
      }
      return {
        supplierId: supplier.id,
        supplierName: supplier.display_name,
        supplierPhone: supplier.phone || '',
        items: nextItems,
      }
    })

    setStepperValues((prev) => ({ ...prev, [product.id]: 1 }))
  }

  function handleStartNewCart() {
    if (!conflictPrompt) return
    const { newSupplier, newProduct, newQty } = conflictPrompt
    setCart({
      supplierId: newSupplier.id,
      supplierName: newSupplier.display_name,
      supplierPhone: newSupplier.phone || '',
      items: [
        {
          productId: newProduct.id,
          name: newProduct.name,
          price: Number(newProduct.price),
          unit: newProduct.unit,
          quantity: newQty,
        },
      ],
    })
    setCartNotice('')
    setConflictPrompt(null)
  }

  function handleKeepOldCart() {
    setConflictPrompt(null)
  }

  function updateCartItemQuantity(productId, newQty) {
    const validQty = Math.max(1, Math.min(999, parseInt(newQty, 10) || 1))
    setCart((prev) => ({
      ...prev,
      items: prev.items.map((i) =>
        i.productId === productId ? { ...i, quantity: validQty } : i
      ),
    }))
  }

  function removeCartItem(productId) {
    setCart((prev) => {
      const filtered = prev.items.filter((i) => i.productId !== productId)
      if (filtered.length === 0) return EMPTY_CART
      return { ...prev, items: filtered }
    })
  }

  function clearCart() {
    setCart(EMPTY_CART)
    setCartNote('')
    setCartNotice('')
    setCheckoutError('')
    setIsConfirmingOrder(false)
  }

  // Cart totals
  const cartSubtotal = cart.items.reduce((sum, item) => sum + item.price * item.quantity, 0)
  const cartTotalItemsCount = cart.items.reduce((sum, item) => sum + item.quantity, 0)

  // Save Shop Business Profile Details
  async function handleSaveShopProfile(e) {
    e.preventDefault()
    setProfileFormError('')

    const trimmedBusiness = shopBusinessName.trim()
    if (trimmedBusiness.length < 2 || trimmedBusiness.length > 60) {
      setProfileFormError('Shop name must be between 2 and 60 characters.')
      return
    }

    const trimmedPhone = shopPhone.trim()
    const phoneRegex = /^[0-9+\s()-]+$/
    const digitCount = trimmedPhone.replace(/\D/g, '').length
    if (
      trimmedPhone.length > 20 ||
      digitCount < 7 ||
      !phoneRegex.test(trimmedPhone)
    ) {
      setProfileFormError('Please enter a valid phone number (at least 7 digits, e.g. 077 123 4567).')
      return
    }

    setSavingShopProfile(true)
    const { data, error } = await supabase
      .from('profiles')
      .update({
        business_name: trimmedBusiness,
        phone: trimmedPhone,
      })
      .eq('id', user.id)
      .select()
      .single()

    if (error) {
      setProfileFormError('Could not save details. Please check your connection.')
      setSavingShopProfile(false)
      return
    }

    setProfile(data)
    setSavingShopProfile(false)
  }

  // Place Order through supabase.rpc('place_order')
  async function handleConfirmPlaceOrder() {
    if (isPlacingOrder || cart.items.length === 0) return
    setIsPlacingOrder(true)
    setCheckoutError('')

    const payload = {
      p_supplier_id: cart.supplierId,
      p_items: cart.items.map((i) => ({
        product_id: i.productId,
        quantity: i.quantity,
      })),
      p_note: cartNote.trim() || null,
    }

    try {
      const { data: newOrderId, error } = await supabase.rpc('place_order', payload)

      if (error) {
        const msg = error.message || ''
        let friendly = 'Could not place order. Please review your cart and try again.'

        if (msg.includes('out of stock')) {
          friendly = 'One or more products in your cart are out of stock. Please check your cart.'
        } else if (msg.includes('different supplier')) {
          friendly = 'All products in an order must be from the same supplier.'
        } else if (msg.includes('order is empty')) {
          friendly = 'Your cart is empty. Please add items before placing an order.'
        } else if (msg.includes('Only shop accounts')) {
          friendly = 'Only shop accounts are allowed to place orders.'
        }

        setCheckoutError(friendly)
        setIsPlacingOrder(false)
        setIsConfirmingOrder(false)

        // Refresh stock info: re-check cart and the open catalogue
        verifyCartProducts(cart)
        if (activeSupplier && activeSupplier.id === cart.supplierId) {
          openSupplierCatalogue(activeSupplier)
        }
        return
      }

      // Success: fetch the saved order to show real verified prices
      const { data: placedOrderData } = await supabase
        .from('orders')
        .select(
          `
          id,
          created_at,
          order_items (
            id,
            product_id,
            quantity,
            unit_price,
            products ( name, unit )
          )
        `
        )
        .eq('id', newOrderId)
        .maybeSingle()

      const savedSupplierName = cart.supplierName

      clearCart()
      setIsPlacingOrder(false)

      setLastPlacedOrder({
        id: String(newOrderId),
        supplierName: savedSupplierName,
        data: placedOrderData,
      })
    } catch {
      setCheckoutError(
        'Check your connection. Your order may not have gone through. Open My Orders to check before sending again.'
      )
      setIsPlacingOrder(false)
      setIsConfirmingOrder(false)
    }
  }

  function handleWhatsAppOrder() {
    if (!cart.items.length) return

    const shopName = profile?.business_name || 'Shop'
    const messageLines = [
      `Hello, I would like to order from ${cart.supplierName || 'your shop'}:`,
      ...cart.items.map((item) => `${item.quantity} x ${item.name} (${item.unit})`),
      `Shop: ${shopName}`,
      `Total: $${cartSubtotal.toFixed(2)}`,
    ]

    const url = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(messageLines.join('\n'))}`
    window.open(url, '_blank', 'noopener,noreferrer')
  }

  // Load My Orders
  const loadMyOrders = useCallback(
    async (page = 0, append = false) => {
      if (!user) return
      setOrdersLoading(true)
      setOrdersError('')

      const from = page * PAGE_SIZE
      const to = from + PAGE_SIZE - 1

      const { data, error } = await supabase
        .from('orders')
        .select(
          `
          id,
          supplier_id,
          status,
          note,
          created_at,
          order_items (
            id,
            quantity,
            unit_price,
            products ( name, unit )
          )
        `
        )
        .eq('shop_id', user.id)
        .order('created_at', { ascending: false })
        .range(from, to)

      if (error) {
        setOrdersError('Failed to load your orders. Please check connection.')
        setOrdersLoading(false)
        return
      }

      // Supplier names
      let supplierList = suppliersRef.current
      if (!supplierList || supplierList.length === 0) {
        const { data: supDir } = await supabase
          .from('supplier_directory')
          .select('id, display_name')
        supplierList = supDir || []
      }
      const supplierMap = new Map(supplierList.map((s) => [s.id, s.display_name]))

      const formatted = (data || []).map((o) => {
        const total = (o.order_items || []).reduce(
          (sum, item) => sum + Number(item.unit_price) * item.quantity,
          0
        )
        return {
          ...o,
          supplierName: supplierMap.get(o.supplier_id) || 'Supplier',
          orderTotal: total,
        }
      })

      if (append) {
        setOrders((prev) => [...prev, ...formatted])
      } else {
        setOrders(formatted)
      }

      setHasMoreOrders((data || []).length === PAGE_SIZE)
      setOrdersPage(page)
      setOrdersLoading(false)
    },
    [user]
  )

  async function handleConfirmReceived(orderId) {
    if (confirmingOrderId) return
    setConfirmingOrderId(orderId)
    setOrdersError('')
    try {
      const { error } = await supabase.rpc('confirm_received', { p_order_id: orderId })
      if (error) {
        setOrdersError(error.message || 'Could not confirm receipt. Please try again.')
      } else {
        await loadMyOrders(0, false)
      }
    } catch {
      setOrdersError('Could not confirm receipt. Please check your connection and try again.')
    }
    setConfirmingOrderId(null)
  }

  useEffect(() => {
    if (activeTab === 'orders' && user) {
      loadMyOrders(0, false)
    }
  }, [activeTab, user, loadMyOrders])

  function toggleOrderExpanded(orderId) {
    setExpandedOrders((prev) => ({
      ...prev,
      [orderId]: !prev[orderId],
    }))
  }

  async function handleLogout() {
    await supabase.auth.signOut()
    navigate('/login')
  }

  if (profileLoading) {
    return (
      <div style={styles.centerContainer}>
        <p style={{ color: 'var(--muted)', fontSize: '16px' }}>Loading your dashboard...</p>
      </div>
    )
  }

  const isProfileIncomplete = !profile?.business_name || !profile?.phone

  const filteredProducts = products.filter((p) =>
    p.name.toLowerCase().includes(productSearch.trim().toLowerCase())
  )

  const filteredSuppliers = suppliers.filter((s) =>
    (s.display_name || '').toLowerCase().includes(supplierSearch.trim().toLowerCase())
  )

  return (
    <div style={styles.page}>
      {/* Top Header */}
      <header style={styles.header}>
        <div style={styles.brandRow}>
          <h1 style={styles.logo}>{APP_NAME}</h1>
          <span style={styles.badge}>Shop Portal</span>
        </div>
        <button type="button" onClick={handleLogout} style={styles.logoutBtn}>
          Log Out
        </button>
      </header>

      {/* Main Container */}
      <main style={styles.main}>
        {/* Welcome Banner */}
        <div style={styles.welcomeCard}>
          <h2 style={styles.greeting}>
            {formatFirstName(profile?.full_name)
              ? `Welcome, ${formatFirstName(profile?.full_name)}!`
              : 'Welcome!'}
          </h2>
          <p style={styles.subtext}>
            Browse verified suppliers, build your cart, and order wholesale stock easily.
          </p>
        </div>

        {/* Navigation Tabs */}
        <nav style={styles.tabsNav} aria-label="Shop Navigation">
          <button
            type="button"
            onClick={() => {
              setActiveTab('shop')
              setLastPlacedOrder(null)
            }}
            style={{
              ...styles.tabBtn,
              ...(activeTab === 'shop' ? styles.tabBtnActive : {}),
            }}
          >
            Shop
          </button>

          <button
            type="button"
            onClick={() => {
              setActiveTab('cart')
              setLastPlacedOrder(null)
            }}
            style={{
              ...styles.tabBtn,
              ...(activeTab === 'cart' ? styles.tabBtnActive : {}),
            }}
          >
            Cart
            {cartTotalItemsCount > 0 && (
              <span style={styles.tabBadge}>{cartTotalItemsCount}</span>
            )}
          </button>

          <button
            type="button"
            onClick={() => {
              setActiveTab('orders')
              setLastPlacedOrder(null)
            }}
            style={{
              ...styles.tabBtn,
              ...(activeTab === 'orders' ? styles.tabBtnActive : {}),
            }}
          >
            My Orders
          </button>
        </nav>

        {/* ========================================================= */}
        {/* TAB 1: SHOP (SUPPLIER DIRECTORY & CATALOGUE)             */}
        {/* ========================================================= */}
        {activeTab === 'shop' && (
          <div>
            {!activeSupplier ? (
              <section style={styles.sectionCard}>
                <div style={styles.sectionHeader}>
                  <h3 style={styles.sectionTitle}>Suppliers in Rusape</h3>
                  <span style={styles.countBadge}>{suppliers.length} available</span>
                </div>

                {suppliers.length > 4 && (
                  <div style={styles.searchBoxWrapper}>
                    <input
                      type="text"
                      value={supplierSearch}
                      onChange={(e) => setSupplierSearch(e.target.value)}
                      placeholder="Search suppliers..."
                      style={styles.searchInput}
                    />
                  </div>
                )}

                {suppliersLoading && (
                  <div style={styles.stateBox}>
                    <p style={{ color: 'var(--muted)' }}>Loading suppliers...</p>
                  </div>
                )}

                {suppliersError && !suppliersLoading && (
                  <div style={styles.stateBox}>
                    <p style={{ color: 'var(--error)', marginBottom: '12px' }}>{suppliersError}</p>
                    <button type="button" onClick={loadSuppliers} style={styles.retryBtn}>
                      Try again
                    </button>
                  </div>
                )}

                {!suppliersLoading && !suppliersError && suppliers.length === 0 && (
                  <div style={styles.stateBox}>
                    <p style={{ color: 'var(--muted)' }}>No suppliers found currently.</p>
                  </div>
                )}

                {!suppliersLoading &&
                  !suppliersError &&
                  suppliers.length > 0 &&
                  filteredSuppliers.length === 0 && (
                    <div style={styles.stateBox}>
                      <p style={{ color: 'var(--muted)' }}>
                        No suppliers matching &ldquo;{supplierSearch}&rdquo;.
                      </p>
                    </div>
                  )}

                {!suppliersLoading && !suppliersError && filteredSuppliers.length > 0 && (
                  <div style={styles.supplierGrid}>
                    {filteredSuppliers.map((s) => (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => openSupplierCatalogue(s)}
                        style={styles.supplierCard}
                      >
                        <div style={styles.supplierCardContent}>
                          <h4 style={styles.supplierName}>{s.display_name}</h4>
                          <p style={styles.supplierPhone}>
                            Supplier contact is shared after acceptance.
                          </p>
                        </div>
                        <span style={styles.viewCatalogLink}>View Catalogue →</span>
                      </button>
                    ))}
                  </div>
                )}
              </section>
            ) : (
              <section style={styles.sectionCard}>
                <div style={styles.catalogueTopNav}>
                  <button type="button" onClick={handleBackToSuppliers} style={styles.backBtn}>
                    ← Back to suppliers
                  </button>
                  <div style={styles.supplierHeaderInfo}>
                    <h3 style={styles.catalogueTitle}>{activeSupplier.display_name}</h3>
                    <p style={styles.supplierPhone}>
                      Supplier contact stays private until the order is accepted.
                    </p>
                  </div>
                </div>

                <div style={styles.searchBoxWrapper}>
                  <input
                    type="text"
                    value={productSearch}
                    onChange={(e) => setProductSearch(e.target.value)}
                    placeholder="Search catalogue (e.g. Sugar, Oil)..."
                    style={styles.searchInput}
                  />
                </div>

                {productsLoading && (
                  <div style={styles.stateBox}>
                    <p style={{ color: 'var(--muted)' }}>Loading products...</p>
                  </div>
                )}

                {productsError && !productsLoading && (
                  <div style={styles.stateBox}>
                    <p style={{ color: 'var(--error)', marginBottom: '12px' }}>{productsError}</p>
                    <button
                      type="button"
                      onClick={() => openSupplierCatalogue(activeSupplier)}
                      style={styles.retryBtn}
                    >
                      Try again
                    </button>
                  </div>
                )}

                {!productsLoading && !productsError && filteredProducts.length === 0 && (
                  <div style={styles.stateBox}>
                    <p style={{ color: 'var(--muted)' }}>
                      {productSearch.trim()
                        ? `No products matching "${productSearch}".`
                        : 'This supplier has no products listed yet.'}
                    </p>
                  </div>
                )}

                {!productsLoading && !productsError && filteredProducts.length > 0 && (
                  <div style={styles.productGrid}>
                    {filteredProducts.map((prod) => {
                      const isOutOfStock = prod.in_stock === false
                      const currentCartQty = getCartItemQty(prod.id)
                      const stepperQty = stepperValues[prod.id] || 1

                      return (
                        <div
                          key={prod.id}
                          style={{
                            ...styles.shopProductCard,
                            ...(isOutOfStock ? styles.outOfStockCard : {}),
                          }}
                        >
                          <div style={styles.prodDetails}>
                            <h4 style={styles.shopProdName}>{prod.name}</h4>
                            <div style={styles.priceLine}>
                              <span style={styles.shopProdPrice}>
                                ${Number(prod.price).toFixed(2)}
                              </span>
                              <span style={styles.shopProdUnit}>/ {prod.unit}</span>
                            </div>
                            {isOutOfStock && (
                              <span style={styles.outOfStockBadge}>Out of stock</span>
                            )}
                          </div>

                          {!isOutOfStock && (
                            <div style={styles.actionRow}>
                              {currentCartQty > 0 ? (
                                <div style={styles.cartStepperBox}>
                                  <span style={styles.inCartLabel}>In cart:</span>
                                  <div style={styles.stepperWrapper}>
                                    <button
                                      type="button"
                                      onClick={() =>
                                        updateCartItemQuantity(prod.id, currentCartQty - 1)
                                      }
                                      style={styles.stepBtn}
                                      aria-label="Decrease quantity"
                                    >
                                      -
                                    </button>
                                    <input
                                      type="number"
                                      min="1"
                                      max="999"
                                      value={currentCartQty}
                                      onChange={(e) =>
                                        updateCartItemQuantity(prod.id, e.target.value)
                                      }
                                      style={styles.stepInput}
                                    />
                                    <button
                                      type="button"
                                      onClick={() =>
                                        updateCartItemQuantity(prod.id, currentCartQty + 1)
                                      }
                                      style={styles.stepBtn}
                                      aria-label="Increase quantity"
                                    >
                                      +
                                    </button>
                                  </div>
                                </div>
                              ) : (
                                <div style={styles.addCartGroup}>
                                  <div style={styles.stepperWrapper}>
                                    <button
                                      type="button"
                                      onClick={() =>
                                        handleQuantityChange(prod.id, stepperQty - 1)
                                      }
                                      style={styles.stepBtn}
                                      aria-label="Decrease quantity"
                                    >
                                      -
                                    </button>
                                    <input
                                      type="number"
                                      min="1"
                                      max="999"
                                      value={stepperQty}
                                      onChange={(e) =>
                                        handleQuantityChange(prod.id, e.target.value)
                                      }
                                      style={styles.stepInput}
                                    />
                                    <button
                                      type="button"
                                      onClick={() =>
                                        handleQuantityChange(prod.id, stepperQty + 1)
                                      }
                                      style={styles.stepBtn}
                                      aria-label="Increase quantity"
                                    >
                                      +
                                    </button>
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() => handleAddToCart(prod)}
                                    style={styles.addToCartBtn}
                                  >
                                    Add to cart
                                  </button>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}
              </section>
            )}

            {/* Conflict Prompt Modal: one supplier per cart */}
            {conflictPrompt && (
              <div style={styles.modalOverlay}>
                <div style={styles.modalCard}>
                  <h4 style={styles.modalTitle}>Start a new cart?</h4>
                  <p style={styles.modalText}>
                    Your cart currently has items from{' '}
                    <strong>{conflictPrompt.currentSupplierName}</strong>. You can only order from
                    one supplier at a time.
                  </p>
                  <div style={styles.modalActions}>
                    <button type="button" onClick={handleStartNewCart} style={styles.confirmBtn}>
                      Start new cart
                    </button>
                    <button type="button" onClick={handleKeepOldCart} style={styles.changeBtn}>
                      Keep old cart
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ========================================================= */}
        {/* TAB 2: CART & CHECKOUT                                   */}
        {/* ========================================================= */}
        {activeTab === 'cart' && (
          <div>
            {lastPlacedOrder ? (
              <section style={styles.sectionCard}>
                <div style={styles.orderSuccessBox}>
                  <h3 style={styles.orderSuccessTitle}>✅ Order Placed Successfully!</h3>
                  <p style={styles.orderNumberText}>
                    Order Reference:{' '}
                    <strong>#{lastPlacedOrder.id.substring(0, 8).toUpperCase()}</strong>
                  </p>
                  <p style={styles.orderSupplierInfo}>
                    Sent to: <strong>{lastPlacedOrder.supplierName}</strong>
                  </p>

                  {lastPlacedOrder.data?.order_items?.length > 0 && (
                    <div style={styles.confirmedItemsList}>
                      <h4 style={styles.confirmedListTitle}>Verified Items:</h4>
                      {lastPlacedOrder.data.order_items.map((item) => (
                        <div key={item.id} style={styles.confirmedItemRow}>
                          <span>
                            {item.quantity}x {item.products?.name} ({item.products?.unit})
                          </span>
                          <span>${(Number(item.unit_price) * item.quantity).toFixed(2)}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={() => {
                      setLastPlacedOrder(null)
                      setActiveTab('orders')
                    }}
                    style={styles.viewOrdersBtn}
                  >
                    View My Orders →
                  </button>
                </div>
              </section>
            ) : cart.items.length === 0 ? (
              <section style={styles.sectionCard}>
                {checkoutError && (
                  <div style={styles.alertError}>
                    <span>{checkoutError}</span>
                  </div>
                )}
                {cartNotice && (
                  <div style={styles.noticeBox}>
                    <span>{cartNotice}</span>
                    <button
                      type="button"
                      onClick={() => setCartNotice('')}
                      style={styles.noticeDismiss}
                    >
                      Dismiss
                    </button>
                  </div>
                )}
                <div style={styles.stateBox}>
                  <p style={{ color: 'var(--muted)', fontSize: '16px' }}>
                    Your cart is empty. Pick a supplier to start.
                  </p>
                  <button
                    type="button"
                    onClick={() => setActiveTab('shop')}
                    style={styles.startShoppingBtn}
                  >
                    Browse Suppliers
                  </button>
                </div>
              </section>
            ) : (
              <section style={styles.sectionCard}>
                {/* Supplier Header */}
                <div style={styles.cartHeaderRow}>
                  <div>
                    <h3 style={styles.cartSupplierName}>{cart.supplierName}</h3>
                    <p style={styles.supplierPhone}>
                      Supplier contact is shared only after acceptance.
                    </p>
                  </div>
                  <button type="button" onClick={clearCart} style={styles.clearCartBtn}>
                    Clear Cart
                  </button>
                </div>

                {cartNotice && (
                  <div style={styles.noticeBox}>
                    <span>{cartNotice}</span>
                    <button
                      type="button"
                      onClick={() => setCartNotice('')}
                      style={styles.noticeDismiss}
                    >
                      Dismiss
                    </button>
                  </div>
                )}

                {/* Items List */}
                <div style={styles.cartLinesList}>
                  {cart.items.map((item) => {
                    const lineTotal = item.price * item.quantity

                    return (
                      <div key={item.productId} style={styles.cartLineItem}>
                        <div style={styles.cartLineInfo}>
                          <h4 style={styles.cartItemTitle}>{item.name}</h4>
                          <span style={styles.cartItemRate}>
                            ${item.price.toFixed(2)} / {item.unit}
                          </span>
                        </div>

                        <div style={styles.cartLineControls}>
                          <div style={styles.stepperWrapper}>
                            <button
                              type="button"
                              onClick={() =>
                                updateCartItemQuantity(item.productId, item.quantity - 1)
                              }
                              style={styles.stepBtn}
                              aria-label={`Decrease ${item.name}`}
                            >
                              -
                            </button>
                            <input
                              type="number"
                              min="1"
                              max="999"
                              value={item.quantity}
                              onChange={(e) =>
                                updateCartItemQuantity(item.productId, e.target.value)
                              }
                              style={styles.stepInput}
                            />
                            <button
                              type="button"
                              onClick={() =>
                                updateCartItemQuantity(item.productId, item.quantity + 1)
                              }
                              style={styles.stepBtn}
                              aria-label={`Increase ${item.name}`}
                            >
                              +
                            </button>
                          </div>

                          <span style={styles.lineTotalText}>${lineTotal.toFixed(2)}</span>

                          <button
                            type="button"
                            onClick={() => removeCartItem(item.productId)}
                            style={styles.removeLineBtn}
                            aria-label={`Remove ${item.name}`}
                          >
                            Remove
                          </button>
                        </div>
                      </div>
                    )
                  })}
                </div>

                {/* Order Subtotal */}
                <div style={styles.subtotalRow}>
                  <span style={styles.subtotalLabel}>Estimated Total:</span>
                  <span style={styles.subtotalValue}>${cartSubtotal.toFixed(2)}</span>
                </div>

                {/* Optional Note */}
                <div style={styles.noteFieldGroup}>
                  <div style={styles.noteLabelRow}>
                    <label htmlFor="cart-note" style={styles.label}>
                      Delivery / Order Note <span style={styles.optionalText}>(optional)</span>
                    </label>
                    <span style={styles.charCounter}>({cartNote.length}/200)</span>
                  </div>
                  <input
                    id="cart-note"
                    type="text"
                    maxLength={200}
                    value={cartNote}
                    onChange={(e) => setCartNote(e.target.value)}
                    placeholder="e.g. Deliver Friday morning"
                    style={styles.input}
                  />
                </div>

                {isProfileIncomplete ? (
                  <div style={styles.completeProfileBox}>
                    <h4 style={styles.profileBoxTitle}>
                      Add your shop details so the supplier can reach you
                    </h4>
                    <form onSubmit={handleSaveShopProfile} style={styles.profileForm}>
                      <div style={styles.fieldGroup}>
                        <label htmlFor="profile-biz-name" style={styles.label}>
                          Shop Name
                        </label>
                        <input
                          id="profile-biz-name"
                          type="text"
                          required
                          value={shopBusinessName}
                          onChange={(e) => setShopBusinessName(e.target.value)}
                          placeholder="e.g. Nyama Corner Store"
                          style={styles.input}
                        />
                      </div>

                      <div style={styles.fieldGroup}>
                        <label htmlFor="profile-phone" style={styles.label}>
                          Phone Number
                        </label>
                        <input
                          id="profile-phone"
                          type="tel"
                          required
                          value={shopPhone}
                          onChange={(e) => setShopPhone(e.target.value)}
                          placeholder="e.g. 077 123 4567"
                          style={styles.input}
                        />
                      </div>

                      {profileFormError && <p style={styles.fieldError}>{profileFormError}</p>}

                      <button
                        type="submit"
                        disabled={savingShopProfile}
                        style={styles.saveProfileBtn}
                      >
                        {savingShopProfile ? 'Saving Details...' : 'Save & Continue'}
                      </button>
                    </form>
                  </div>
                ) : (
                  <div>
                    {checkoutError && (
                      <div style={styles.alertError}>
                        <span>{checkoutError}</span>
                      </div>
                    )}

                    {isConfirmingOrder ? (
                      <div style={styles.confirmBox}>
                        <h4 style={styles.confirmTitle}>Confirm Order Submission</h4>
                        <p style={styles.confirmText}>
                          Send this order of{' '}
                          <strong style={{ color: 'var(--green)' }}>
                            ${cartSubtotal.toFixed(2)}
                          </strong>{' '}
                          to <strong>{cart.supplierName}</strong>?
                        </p>
                        <p style={styles.smallDisclaimer}>
                          Final prices are confirmed when your order is sent.
                        </p>
                        <div style={styles.confirmActions}>
                          <button
                            type="button"
                            onClick={handleConfirmPlaceOrder}
                            disabled={isPlacingOrder}
                            style={styles.confirmBtn}
                          >
                            {isPlacingOrder ? 'Sending order...' : 'Confirm'}
                          </button>
                          <button
                            type="button"
                            onClick={() => setIsConfirmingOrder(false)}
                            disabled={isPlacingOrder}
                            style={styles.changeBtn}
                          >
                            Change
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div style={styles.orderActionRow}>
                        <button
                          type="button"
                          onClick={() => {
                            setCheckoutError('')
                            setIsConfirmingOrder(true)
                          }}
                          style={styles.placeOrderBtn}
                        >
                          Order now (${cartSubtotal.toFixed(2)})
                        </button>
                        <button
                          type="button"
                          onClick={handleWhatsAppOrder}
                          style={styles.whatsappBtn}
                        >
                          Order on WhatsApp
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </section>
            )}
          </div>
        )}

        {/* ========================================================= */}
        {/* TAB 3: MY ORDERS                                          */}
        {/* ========================================================= */}
        {activeTab === 'orders' && (
          <section style={styles.sectionCard}>
            <div style={styles.sectionHeader}>
              <h3 style={styles.sectionTitle}>Order History</h3>
              <button
                type="button"
                onClick={() => loadMyOrders(0, false)}
                style={styles.refreshBtn}
                disabled={ordersLoading}
              >
                {ordersLoading ? 'Refreshing...' : '🔄 Refresh'}
              </button>
            </div>

            {ordersLoading && orders.length === 0 && (
              <div style={styles.stateBox}>
                <p style={{ color: 'var(--muted)' }}>Loading your orders...</p>
              </div>
            )}

            {ordersError && orders.length === 0 && (
              <div style={styles.stateBox}>
                <p style={{ color: 'var(--error)', marginBottom: '12px' }}>{ordersError}</p>
                <button type="button" onClick={() => loadMyOrders(0, false)} style={styles.retryBtn}>
                  Try again
                </button>
              </div>
            )}

            {ordersError && orders.length > 0 && (
              <div style={styles.alertError}>
                <span>{ordersError}</span>
              </div>
            )}

            {!ordersLoading && !ordersError && orders.length === 0 && (
              <div style={styles.stateBox}>
                <p style={{ color: 'var(--muted)' }}>No orders yet. Your orders will appear here.</p>
                <button
                  type="button"
                  onClick={() => setActiveTab('shop')}
                  style={styles.startShoppingBtn}
                >
                  Browse Suppliers
                </button>
              </div>
            )}

            {orders.length > 0 && (
              <div style={styles.ordersList}>
                {orders.map((o) => {
                  const statusInfo = STATUS_CONFIG[o.status] || STATUS_CONFIG.pending
                  const isExpanded = !!expandedOrders[o.id]
                  const formattedDate = o.created_at
                    ? new Date(o.created_at).toLocaleString()
                    : ''

                  return (
                    <div key={o.id} style={styles.orderCard}>
                      <div style={styles.orderHeaderRow}>
                        <div>
                          <h4 style={styles.orderSupplierTitle}>{o.supplierName}</h4>
                          <span style={styles.orderDate}>{formattedDate}</span>
                        </div>
                        <span
                          style={{
                            ...styles.statusBadge,
                            backgroundColor: statusInfo.bg,
                            color: statusInfo.color,
                            borderColor: statusInfo.border,
                          }}
                        >
                          {statusInfo.label}
                        </span>
                      </div>

                      <div style={styles.orderSummaryLine}>
                        <span style={styles.orderTotalText}>
                          Total: <strong>${Number(o.orderTotal).toFixed(2)}</strong>
                        </span>
                        <button
                          type="button"
                          onClick={() => toggleOrderExpanded(o.id)}
                          style={styles.toggleExpandBtn}
                        >
                          {isExpanded
                            ? 'Hide items ▲'
                            : `View items (${o.order_items?.length || 0}) ▼`}
                        </button>
                      </div>

                      {o.note && (
                        <p style={styles.orderNoteDisplay}>📝 Note: &ldquo;{o.note}&rdquo;</p>
                      )}

                      {o.status === 'delivered' && (
                        <button
                          type="button"
                          onClick={() => handleConfirmReceived(o.id)}
                          disabled={confirmingOrderId === o.id}
                          style={styles.confirmReceivedBtn}
                        >
                          {confirmingOrderId === o.id ? 'Confirming...' : 'Confirm received'}
                        </button>
                      )}

                      {isExpanded && (
                        <div style={styles.expandedItemsBox}>
                          {o.order_items?.map((item) => (
                            <div key={item.id} style={styles.itemDetailRow}>
                              <span>
                                {item.quantity}x {item.products?.name || 'Product'} (
                                {item.products?.unit})
                              </span>
                              <span>${(Number(item.unit_price) * item.quantity).toFixed(2)}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )
                })}

                {hasMoreOrders && (
                  <button
                    type="button"
                    onClick={() => loadMyOrders(ordersPage + 1, true)}
                    disabled={ordersLoading}
                    style={styles.loadMoreBtn}
                  >
                    {ordersLoading ? 'Loading more...' : 'Load more orders'}
                  </button>
                )}
              </div>
            )}
          </section>
        )}
      </main>
    </div>
  )
}

const styles = {
  page: {
    minHeight: '100vh',
    backgroundColor: 'var(--bg)',
    display: 'flex',
    flexDirection: 'column',
    fontFamily: 'inherit',
    boxSizing: 'border-box',
  },
  centerContainer: {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'var(--bg)',
  },
  header: {
    backgroundColor: 'var(--card)',
    padding: '14px 20px',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottom: '1px solid var(--border)',
    boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
  },
  brandRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
  },
  logo: {
    fontSize: '22px',
    fontWeight: '700',
    color: 'var(--green)',
    margin: 0,
  },
  badge: {
    fontSize: '12px',
    fontWeight: '600',
    backgroundColor: 'var(--amber-light)',
    color: 'var(--text)',
    padding: '3px 8px',
    borderRadius: '12px',
    border: '1px solid var(--amber)',
  },
  logoutBtn: {
    backgroundColor: 'transparent',
    border: '1px solid var(--border)',
    color: 'var(--muted)',
    padding: '8px 14px',
    borderRadius: '6px',
    fontSize: '14px',
    fontWeight: '600',
    cursor: 'pointer',
    minHeight: '44px',
    display: 'inline-flex',
    alignItems: 'center',
  },
  main: {
    flex: 1,
    padding: '16px',
    maxWidth: '760px',
    width: '100%',
    margin: '0 auto',
    boxSizing: 'border-box',
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
  },
  welcomeCard: {
    backgroundColor: 'var(--card)',
    borderRadius: '12px',
    padding: '20px',
    border: '1px solid var(--border)',
    boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
  },
  greeting: {
    margin: '0 0 6px',
    fontSize: '20px',
    color: 'var(--text)',
    fontWeight: '700',
  },
  subtext: {
    margin: 0,
    color: 'var(--muted)',
    fontSize: '14px',
    lineHeight: 1.5,
  },
  tabsNav: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr 1fr',
    gap: '8px',
  },
  tabBtn: {
    minHeight: '46px',
    padding: '8px 12px',
    borderRadius: '8px',
    border: '1px solid var(--border)',
    backgroundColor: 'var(--card)',
    color: 'var(--muted)',
    fontWeight: '600',
    fontSize: '15px',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '6px',
    transition: 'all 0.15s ease',
  },
  tabBtnActive: {
    backgroundColor: 'var(--green)',
    color: '#ffffff',
    borderColor: 'var(--green)',
  },
  tabBadge: {
    backgroundColor: 'var(--amber)',
    color: '#ffffff',
    fontSize: '12px',
    fontWeight: '700',
    padding: '2px 7px',
    borderRadius: '10px',
  },
  sectionCard: {
    backgroundColor: 'var(--card)',
    borderRadius: '12px',
    padding: '20px',
    border: '1px solid var(--border)',
    boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
    boxSizing: 'border-box',
  },
  sectionHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '16px',
  },
  sectionTitle: {
    margin: 0,
    fontSize: '18px',
    fontWeight: '700',
    color: 'var(--text)',
  },
  countBadge: {
    fontSize: '13px',
    fontWeight: '600',
    color: 'var(--muted)',
    backgroundColor: 'var(--bg)',
    padding: '4px 10px',
    borderRadius: '12px',
    border: '1px solid var(--border)',
  },
  supplierGrid: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
  },
  supplierCard: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '16px',
    borderRadius: '10px',
    border: '1px solid var(--border)',
    backgroundColor: 'var(--card)',
    cursor: 'pointer',
    textAlign: 'left',
    transition: 'border-color 0.15s ease',
    minHeight: '64px',
  },
  supplierCardContent: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
  },
  supplierName: {
    margin: 0,
    fontSize: '16px',
    fontWeight: '700',
    color: 'var(--text)',
  },
  supplierPhone: {
    margin: 0,
    fontSize: '13px',
    color: 'var(--muted)',
  },
  viewCatalogLink: {
    fontSize: '14px',
    fontWeight: '600',
    color: 'var(--green)',
  },
  catalogueTopNav: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
    marginBottom: '16px',
  },
  backBtn: {
    alignSelf: 'flex-start',
    backgroundColor: 'transparent',
    border: 'none',
    color: 'var(--green)',
    fontWeight: '600',
    fontSize: '14px',
    cursor: 'pointer',
    padding: '4px 0',
    minHeight: '40px',
    display: 'inline-flex',
    alignItems: 'center',
  },
  supplierHeaderInfo: {
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
  },
  catalogueTitle: {
    margin: 0,
    fontSize: '20px',
    fontWeight: '700',
    color: 'var(--text)',
  },
  searchBoxWrapper: {
    marginBottom: '16px',
  },
  searchInput: {
    width: '100%',
    height: '48px',
    fontSize: '16px',
    padding: '0 14px',
    borderRadius: '8px',
    border: '1px solid var(--border)',
    color: 'var(--text)',
    backgroundColor: 'var(--card)',
    boxSizing: 'border-box',
    outline: 'none',
  },
  productGrid: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
  },
  shopProductCard: {
    border: '1px solid var(--border)',
    borderRadius: '10px',
    padding: '16px',
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
    backgroundColor: 'var(--card)',
    boxShadow: '0 1px 3px rgba(0,0,0,0.02)',
  },
  outOfStockCard: {
    backgroundColor: '#F9FAFB',
    opacity: 0.7,
  },
  prodDetails: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
  },
  shopProdName: {
    margin: 0,
    fontSize: '16px',
    fontWeight: '700',
    color: 'var(--text)',
  },
  priceLine: {
    display: 'flex',
    alignItems: 'baseline',
    gap: '6px',
  },
  shopProdPrice: {
    fontSize: '18px',
    fontWeight: '700',
    color: 'var(--green)',
  },
  shopProdUnit: {
    fontSize: '14px',
    color: 'var(--muted)',
  },
  outOfStockBadge: {
    display: 'inline-block',
    alignSelf: 'flex-start',
    backgroundColor: '#FEE2E2',
    color: 'var(--error)',
    fontSize: '12px',
    fontWeight: '600',
    padding: '2px 8px',
    borderRadius: '4px',
    marginTop: '4px',
  },
  actionRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: '10px',
  },
  addCartGroup: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    width: '100%',
    justifyContent: 'space-between',
  },
  cartStepperBox: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    width: '100%',
    justifyContent: 'space-between',
  },
  inCartLabel: {
    fontSize: '14px',
    fontWeight: '600',
    color: 'var(--green)',
  },
  stepperWrapper: {
    display: 'flex',
    alignItems: 'center',
    border: '1px solid var(--border)',
    borderRadius: '8px',
    overflow: 'hidden',
    height: '44px',
  },
  stepBtn: {
    width: '40px',
    height: '44px',
    backgroundColor: 'var(--bg)',
    border: 'none',
    fontSize: '18px',
    fontWeight: '600',
    color: 'var(--text)',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepInput: {
    width: '50px',
    height: '44px',
    border: 'none',
    borderLeft: '1px solid var(--border)',
    borderRight: '1px solid var(--border)',
    textAlign: 'center',
    fontSize: '16px',
    fontWeight: '600',
    color: 'var(--text)',
    backgroundColor: 'var(--card)',
    outline: 'none',
  },
  addToCartBtn: {
    minHeight: '44px',
    padding: '0 18px',
    backgroundColor: 'var(--green)',
    color: '#ffffff',
    border: 'none',
    borderRadius: '8px',
    fontSize: '15px',
    fontWeight: '700',
    cursor: 'pointer',
  },
  modalOverlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '16px',
    zIndex: 1000,
  },
  modalCard: {
    backgroundColor: 'var(--card)',
    borderRadius: '12px',
    padding: '24px',
    maxWidth: '420px',
    width: '100%',
    boxShadow: '0 10px 25px rgba(0,0,0,0.2)',
    display: 'flex',
    flexDirection: 'column',
    gap: '14px',
  },
  modalTitle: {
    margin: 0,
    fontSize: '18px',
    fontWeight: '700',
    color: 'var(--text)',
  },
  modalText: {
    margin: 0,
    fontSize: '15px',
    color: 'var(--text)',
    lineHeight: 1.5,
  },
  modalActions: {
    display: 'flex',
    gap: '10px',
    marginTop: '6px',
  },
  cartHeaderRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: '16px',
    borderBottom: '1px solid var(--border)',
    paddingBottom: '12px',
  },
  cartSupplierName: {
    margin: '0 0 4px',
    fontSize: '18px',
    fontWeight: '700',
    color: 'var(--text)',
  },
  clearCartBtn: {
    background: 'none',
    border: 'none',
    color: 'var(--error)',
    fontSize: '13px',
    fontWeight: '600',
    cursor: 'pointer',
    padding: '4px 8px',
  },
  noticeBox: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: '12px',
    backgroundColor: 'var(--amber-light)',
    border: '1px solid var(--amber)',
    color: '#92400E',
    padding: '12px 14px',
    borderRadius: '8px',
    fontSize: '14px',
    fontWeight: '500',
    marginBottom: '16px',
  },
  noticeDismiss: {
    background: 'none',
    border: 'none',
    color: '#92400E',
    fontSize: '13px',
    fontWeight: '700',
    cursor: 'pointer',
    padding: '4px 8px',
    whiteSpace: 'nowrap',
  },
  cartLinesList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '14px',
    marginBottom: '20px',
  },
  cartLineItem: {
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
    padding: '12px',
    backgroundColor: 'var(--bg)',
    borderRadius: '8px',
  },
  cartLineInfo: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'baseline',
  },
  cartItemTitle: {
    margin: 0,
    fontSize: '16px',
    fontWeight: '700',
    color: 'var(--text)',
  },
  cartItemRate: {
    fontSize: '13px',
    color: 'var(--muted)',
  },
  cartLineControls: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '8px',
    flexWrap: 'wrap',
  },
  lineTotalText: {
    fontSize: '16px',
    fontWeight: '700',
    color: 'var(--green)',
  },
  removeLineBtn: {
    background: 'none',
    border: 'none',
    color: 'var(--error)',
    fontSize: '13px',
    fontWeight: '600',
    cursor: 'pointer',
    minHeight: '44px',
    display: 'inline-flex',
    alignItems: 'center',
    padding: '0 8px',
  },
  subtotalRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '16px 0',
    borderTop: '2px solid var(--border)',
    marginBottom: '16px',
  },
  subtotalLabel: {
    fontSize: '17px',
    fontWeight: '700',
    color: 'var(--text)',
  },
  subtotalValue: {
    fontSize: '22px',
    fontWeight: '700',
    color: 'var(--green)',
  },
  noteFieldGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
    marginBottom: '20px',
  },
  noteLabelRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  charCounter: {
    fontSize: '12px',
    color: 'var(--muted)',
  },
  completeProfileBox: {
    backgroundColor: 'var(--amber-light)',
    border: '1px solid var(--amber)',
    borderRadius: '10px',
    padding: '16px',
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
  },
  profileBoxTitle: {
    margin: 0,
    fontSize: '15px',
    fontWeight: '700',
    color: '#92400E',
  },
  profileForm: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
  },
  saveProfileBtn: {
    minHeight: '46px',
    backgroundColor: 'var(--green)',
    color: '#ffffff',
    border: 'none',
    borderRadius: '8px',
    fontSize: '15px',
    fontWeight: '700',
    cursor: 'pointer',
    marginTop: '4px',
  },
  orderActionRow: {
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
  },
  placeOrderBtn: {
    width: '100%',
    height: '48px',
    backgroundColor: 'var(--green)',
    color: '#ffffff',
    border: 'none',
    borderRadius: '8px',
    fontSize: '16px',
    fontWeight: '700',
    cursor: 'pointer',
  },
  whatsappBtn: {
    width: '100%',
    height: '48px',
    backgroundColor: '#25D366',
    color: '#ffffff',
    border: 'none',
    borderRadius: '8px',
    fontSize: '16px',
    fontWeight: '700',
    cursor: 'pointer',
  },
  confirmBox: {
    backgroundColor: 'var(--bg)',
    border: '2px solid var(--green)',
    borderRadius: '10px',
    padding: '18px',
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
  },
  confirmTitle: {
    margin: 0,
    fontSize: '16px',
    color: 'var(--text)',
  },
  confirmText: {
    margin: 0,
    fontSize: '16px',
    color: 'var(--text)',
    lineHeight: 1.5,
  },
  smallDisclaimer: {
    margin: 0,
    fontSize: '13px',
    color: 'var(--muted)',
  },
  confirmActions: {
    display: 'flex',
    gap: '10px',
    flexWrap: 'wrap',
    marginTop: '6px',
  },
  confirmBtn: {
    minHeight: '44px',
    padding: '0 20px',
    backgroundColor: 'var(--green)',
    color: '#ffffff',
    border: 'none',
    borderRadius: '8px',
    fontSize: '15px',
    fontWeight: '700',
    cursor: 'pointer',
  },
  changeBtn: {
    minHeight: '44px',
    padding: '0 18px',
    backgroundColor: 'transparent',
    border: '1px solid var(--border)',
    color: 'var(--text)',
    borderRadius: '8px',
    fontSize: '15px',
    fontWeight: '600',
    cursor: 'pointer',
  },
  orderSuccessBox: {
    textAlign: 'center',
    padding: '24px 16px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '12px',
  },
  orderSuccessTitle: {
    margin: 0,
    fontSize: '20px',
    color: 'var(--green)',
  },
  orderNumberText: {
    margin: 0,
    fontSize: '16px',
    color: 'var(--text)',
  },
  orderSupplierInfo: {
    margin: 0,
    fontSize: '15px',
    color: 'var(--muted)',
  },
  confirmedItemsList: {
    width: '100%',
    maxWidth: '480px',
    backgroundColor: 'var(--bg)',
    padding: '14px',
    borderRadius: '8px',
    marginTop: '8px',
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
    textAlign: 'left',
    boxSizing: 'border-box',
  },
  confirmedListTitle: {
    margin: '0 0 6px',
    fontSize: '14px',
    color: 'var(--muted)',
  },
  confirmedItemRow: {
    display: 'flex',
    justifyContent: 'space-between',
    fontSize: '14px',
    color: 'var(--text)',
  },
  viewOrdersBtn: {
    minHeight: '46px',
    padding: '0 24px',
    backgroundColor: 'var(--green)',
    color: '#ffffff',
    border: 'none',
    borderRadius: '8px',
    fontSize: '15px',
    fontWeight: '700',
    cursor: 'pointer',
    marginTop: '12px',
  },
  startShoppingBtn: {
    minHeight: '44px',
    padding: '0 20px',
    backgroundColor: 'var(--green)',
    color: '#ffffff',
    border: 'none',
    borderRadius: '8px',
    fontSize: '14px',
    fontWeight: '700',
    cursor: 'pointer',
    marginTop: '12px',
  },
  ordersList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '14px',
  },
  orderCard: {
    border: '1px solid var(--border)',
    borderRadius: '10px',
    padding: '16px',
    backgroundColor: 'var(--card)',
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
    boxShadow: '0 1px 3px rgba(0,0,0,0.02)',
  },
  orderHeaderRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: '10px',
  },
  orderSupplierTitle: {
    margin: '0 0 2px',
    fontSize: '17px',
    fontWeight: '700',
    color: 'var(--text)',
  },
  orderDate: {
    fontSize: '12px',
    color: 'var(--muted)',
  },
  statusBadge: {
    fontSize: '12px',
    fontWeight: '700',
    padding: '3px 9px',
    borderRadius: '12px',
    border: '1px solid transparent',
    whiteSpace: 'nowrap',
  },
  orderSummaryLine: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: '6px',
    borderTop: '1px solid #F3F4F6',
  },
  orderTotalText: {
    fontSize: '15px',
    color: 'var(--text)',
  },
  toggleExpandBtn: {
    background: 'none',
    border: 'none',
    color: 'var(--green)',
    fontWeight: '600',
    fontSize: '13px',
    cursor: 'pointer',
    padding: '4px 0',
    minHeight: '40px',
    display: 'inline-flex',
    alignItems: 'center',
  },
  orderNoteDisplay: {
    margin: 0,
    fontSize: '13px',
    color: 'var(--muted)',
    fontStyle: 'italic',
  },
  confirmReceivedBtn: {
    minHeight: '44px',
    padding: '0 18px',
    backgroundColor: 'var(--green)',
    color: '#ffffff',
    border: 'none',
    borderRadius: '8px',
    fontSize: '14px',
    fontWeight: '700',
    cursor: 'pointer',
    alignSelf: 'flex-start',
  },
  expandedItemsBox: {
    backgroundColor: 'var(--bg)',
    borderRadius: '8px',
    padding: '12px',
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
    marginTop: '6px',
  },
  itemDetailRow: {
    display: 'flex',
    justifyContent: 'space-between',
    fontSize: '13px',
    color: 'var(--text)',
  },
  refreshBtn: {
    background: 'none',
    border: '1px solid var(--border)',
    borderRadius: '6px',
    padding: '6px 12px',
    fontSize: '13px',
    fontWeight: '600',
    color: 'var(--text)',
    cursor: 'pointer',
    minHeight: '40px',
  },
  loadMoreBtn: {
    width: '100%',
    minHeight: '44px',
    backgroundColor: 'var(--card)',
    border: '1px solid var(--border)',
    borderRadius: '8px',
    fontSize: '14px',
    fontWeight: '600',
    color: 'var(--text)',
    cursor: 'pointer',
    marginTop: '8px',
  },
  fieldGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
  },
  label: {
    fontSize: '15px',
    fontWeight: '600',
    color: 'var(--text)',
  },
  optionalText: {
    fontSize: '13px',
    fontWeight: '400',
    color: 'var(--muted)',
  },
  input: {
    width: '100%',
    height: '48px',
    fontSize: '16px',
    padding: '0 14px',
    borderRadius: '8px',
    border: '1px solid var(--border)',
    color: 'var(--text)',
    backgroundColor: 'var(--card)',
    boxSizing: 'border-box',
    outline: 'none',
  },
  fieldError: {
    color: 'var(--error)',
    fontSize: '13px',
    margin: 0,
  },
  alertError: {
    backgroundColor: '#FEE2E2',
    color: 'var(--error)',
    padding: '12px 16px',
    borderRadius: '8px',
    border: '1px solid #FCA5A5',
    fontSize: '14px',
    fontWeight: '500',
    marginBottom: '12px',
  },
  stateBox: {
    padding: '32px 16px',
    textAlign: 'center',
    backgroundColor: 'var(--bg)',
    borderRadius: '8px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
  },
  retryBtn: {
    backgroundColor: 'var(--card)',
    border: '1px solid var(--border)',
    color: 'var(--text)',
    padding: '8px 16px',
    borderRadius: '6px',
    fontSize: '14px',
    fontWeight: '600',
    cursor: 'pointer',
    minHeight: '44px',
  },
}
