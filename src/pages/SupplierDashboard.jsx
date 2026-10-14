import { useEffect, useState, useRef, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useNavigate } from 'react-router-dom'
import { APP_NAME } from '../config'

const COMMISSION_RATE = 0.03

const COMMON_PRODUCTS = [
  'Sugar', 'Cooking oil', 'Rice', 'Maize meal', 'Flour', 'Salt', 'Beans',
  'Peanut butter', 'Margarine', 'Fresh milk', 'Long-life milk', 'Bread',
  'Eggs', 'Tea', 'Coffee', 'Bath soap', 'Washing powder', 'Dish liquid',
  'Toilet paper', 'Matches', 'Candles', 'Bottled water', 'Soft drink',
]

const UNIT_OPTIONS = [
  'each', 'kg', '2kg', '10kg', '50kg', '500ml', '750ml', '1L', '2L', '5L',
  'dozen', 'pack', 'carton', 'loaf', 'other',
]

const UNIT_PRICE_THRESHOLDS = {
  each: 100, loaf: 10, dozen: 20, '500ml': 20, '750ml': 20, '1L': 20,
  '2L': 30, '5L': 50, kg: 50, '2kg': 60, '10kg': 100, '50kg': 300,
  pack: 100, carton: 300, other: 500,
}

const STATUS_CONFIG = {
  pending:   { label: 'New Order',  bg: '#FEF3C7', color: '#92400E', border: '#F59E0B' },
  accepted:  { label: 'Accepted',   bg: '#DCFCE7', color: '#166534', border: '#22C55E' },
  rejected:  { label: 'Declined',   bg: '#FEE2E2', color: '#991B1B', border: '#EF4444' },
  ready:     { label: 'Ready',      bg: '#DBEAFE', color: '#1D4ED8', border: '#60A5FA' },
  delivered: { label: 'Delivered',  bg: '#ECFDF5', color: '#065F46', border: '#10B981' },
  completed: { label: 'Completed',  bg: '#E0F2FE', color: '#0F766E', border: '#2DD4BF' },
  cancelled: { label: 'Cancelled',  bg: '#F3F4F6', color: '#4B5563', border: '#9CA3AF' },
}

const PAGE_SIZE = 20

function formatFirstName(fullName) {
  if (!fullName || !fullName.trim()) return ''
  const firstWord = fullName.trim().split(/\s+/)[0]
  return firstWord.charAt(0).toUpperCase() + firstWord.slice(1).toLowerCase()
}

function levenshteinDistance(a, b) {
  const al = a.length
  const bl = b.length
  if (Math.abs(al - bl) > 2) return 99
  const matrix = Array.from({ length: al + 1 }, () => new Array(bl + 1).fill(0))
  for (let i = 0; i <= al; i++) matrix[i][0] = i
  for (let j = 0; j <= bl; j++) matrix[0][j] = j
  for (let i = 1; i <= al; i++) {
    for (let j = 1; j <= bl; j++) {
      const cost = a[i - 1].toLowerCase() === b[j - 1].toLowerCase() ? 0 : 1
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost
      )
    }
  }
  return matrix[al][bl]
}

function findClosestTypo(typed) {
  const clean = typed.trim().toLowerCase()
  if (!clean || clean.length < 3) return null
  if (COMMON_PRODUCTS.some((p) => p.toLowerCase() === clean)) return null
  let closest = null
  let minDistance = 3
  for (const item of COMMON_PRODUCTS) {
    const dist = levenshteinDistance(clean, item)
    if (dist > 0 && dist <= 2 && dist < minDistance) {
      minDistance = dist
      closest = item
    }
  }
  return closest
}

export default function SupplierDashboard() {
  const navigate = useNavigate()
  const [user, setUser] = useState(null)
  const [profile, setProfile] = useState(null)
  const [profileLoading, setProfileLoading] = useState(true)

  // Current active tab: 'orders', 'products', 'earnings'
  const [activeTab, setActiveTab] = useState('orders')

  // Products state
  const [products, setProducts] = useState([])
  const [productsLoading, setProductsLoading] = useState(true)
  const [productsError, setProductsError] = useState('')

  // Form states - Combobox Product Name
  const [productNameInput, setProductNameInput] = useState('')
  const [isComboOpen, setIsComboOpen] = useState(false)
  const [activeHighlightIndex, setActiveHighlightIndex] = useState(-1)
  const comboRef = useRef(null)

  const [brand, setBrand] = useState('')
  const [price, setPrice] = useState('')
  const [unit, setUnit] = useState('each')
  const [customUnit, setCustomUnit] = useState('')
  const [priceConfirmedHigh, setPriceConfirmedHigh] = useState(false)

  // Validation & Confirm card states
  const [productNameError, setProductNameError] = useState('')
  const [formError, setFormError] = useState('')
  const [formSuccess, setFormSuccess] = useState('')
  const [pendingProduct, setPendingProduct] = useState(null)
  const [submitting, setSubmitting] = useState(false)

  // Inline Price Editing state
  const [editingId, setEditingId] = useState(null)
  const [editPriceValue, setEditPriceValue] = useState('')
  const [editConfirmedHigh, setEditConfirmedHigh] = useState(false)
  const [editError, setEditError] = useState('')
  const [savingEdit, setSavingEdit] = useState(false)

  // Global action error message
  const [actionError, setActionError] = useState('')

  // --- Incoming Orders State ---
  const [incomingOrders, setIncomingOrders] = useState([])
  const [ordersLoading, setOrdersLoading] = useState(false)
  const [ordersError, setOrdersError] = useState('')
  const [orderContacts, setOrderContacts] = useState({})
  const [expandedOrders, setExpandedOrders] = useState({})
  const [ordersPage, setOrdersPage] = useState(0)
  const [hasMoreOrders, setHasMoreOrders] = useState(true)
  const [processingOrderId, setProcessingOrderId] = useState(null)
  const [confirmAction, setConfirmAction] = useState(null) // { orderId, action, label }
  const [orderFilter, setOrderFilter] = useState('active') // 'active', 'all', 'completed'

  // Close combobox on outside click
  useEffect(() => {
    function handleClickOutside(event) {
      if (comboRef.current && !comboRef.current.contains(event.target)) {
        setIsComboOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [])

  // Load incoming orders
  const loadIncomingOrders = useCallback(
    async (page = 0, append = false, userId = user?.id) => {
      if (!userId) return
      setOrdersLoading(true)
      setOrdersError('')

      const from = page * PAGE_SIZE
      const to = from + PAGE_SIZE - 1

      let query = supabase
        .from('orders')
        .select(`
          id,
          shop_id,
          supplier_id,
          status,
          note,
          created_at,
          delivered_at,
          commission_amount,
          order_items (
            id,
            quantity,
            unit_price,
            products ( name, unit )
          )
        `)
        .eq('supplier_id', userId)
        .order('created_at', { ascending: false })
        .range(from, to)

      const { data, error } = await query

      if (error) {
        setOrdersError('Could not load incoming orders.')
        setOrdersLoading(false)
        return
      }

      const formatted = (data || []).map((order) => {
        const total = (order.order_items || []).reduce(
          (sum, item) => sum + Number(item.unit_price) * item.quantity,
          0
        )
        return { ...order, orderTotal: total }
      })

      // Fetch contacts for orders that are accepted or beyond
      const contacts = {}
      for (const o of formatted) {
        if (['accepted', 'ready', 'delivered', 'completed'].includes(o.status)) {
          try {
            const { data: c } = await supabase.rpc('get_shop_contact', { p_order_id: o.id })
            const row = Array.isArray(c) ? c[0] : c
            if (row) {
              contacts[o.id] = {
                business_name: row.business_name || row.shop_name || 'Shop',
                phone: row.phone || 'Phone unavailable',
              }
            }
          } catch {
            // Silently skip contact fetch errors
          }
        }
      }

      if (append) {
        setIncomingOrders((prev) => [...prev, ...formatted])
        setOrderContacts((prev) => ({ ...prev, ...contacts }))
      } else {
        setIncomingOrders(formatted)
        setOrderContacts(contacts)
      }

      setHasMoreOrders((data || []).length === PAGE_SIZE)
      setOrdersPage(page)
      setOrdersLoading(false)
    },
    [user]
  )

  useEffect(() => {
    async function loadUserAndProfile() {
      const { data: { user: authUser } } = await supabase.auth.getUser()
      if (!authUser) {
        navigate('/login')
        return
      }
      setUser(authUser)

      const { data: profileData } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', authUser.id)
        .single()

      if (profileData) {
        setProfile(profileData)
      }
      setProfileLoading(false)
      loadProducts(authUser.id)
      loadIncomingOrders(0, false, authUser.id)
    }

    loadUserAndProfile()
  }, [navigate, loadIncomingOrders])

  // Reload orders when tab or filter changes
  useEffect(() => {
    if (activeTab === 'orders' && user) {
      loadIncomingOrders(0, false)
    }
  }, [activeTab, user, loadIncomingOrders])

  async function loadProducts(userId) {
    setProductsLoading(true)
    setProductsError('')
    const { data, error } = await supabase
      .from('products')
      .select('*')
      .eq('supplier_id', userId)
      .order('created_at', { ascending: false })

    if (error) {
      setProductsError('Failed to load your products. Please check your connection.')
    } else {
      setProducts(data || [])
    }
    setProductsLoading(false)
  }

  // --- Order Action Handlers (via RPC) ---
  async function handleAcceptOrder(orderId) {
    if (processingOrderId) return
    setProcessingOrderId(orderId)
    setActionError('')
    try {
      const { error } = await supabase.rpc('approve_order', { p_order_id: orderId })
      if (error) {
        setActionError(error.message || 'Could not accept this order.')
        setProcessingOrderId(null)
        return
      }

      // Fetch shop contact after acceptance
      try {
        const { data: contactData } = await supabase.rpc('get_shop_contact', {
          p_order_id: orderId,
        })
        const contact = Array.isArray(contactData) ? contactData[0] : contactData
        if (contact) {
          setOrderContacts((prev) => ({
            ...prev,
            [orderId]: {
              business_name: contact.business_name || contact.shop_name || 'Shop',
              phone: contact.phone || 'Phone unavailable',
            },
          }))
        }
      } catch {
        // Non-critical: contact fetch failed
      }

      await loadIncomingOrders(0, false)
    } catch {
      setActionError('Could not accept this order. Please try again.')
    }
    setProcessingOrderId(null)
    setConfirmAction(null)
  }

  async function handleRejectOrder(orderId) {
    if (processingOrderId) return
    setProcessingOrderId(orderId)
    setActionError('')
    try {
      const { error } = await supabase.rpc('reject_order', { p_order_id: orderId })
      if (error) {
        setActionError(error.message || 'Could not decline this order.')
        setProcessingOrderId(null)
        return
      }
      await loadIncomingOrders(0, false)
    } catch {
      setActionError('Could not decline this order. Please try again.')
    }
    setProcessingOrderId(null)
    setConfirmAction(null)
  }

  async function handleMarkReady(orderId) {
    if (processingOrderId) return
    setProcessingOrderId(orderId)
    setActionError('')
    try {
      const { error } = await supabase.rpc('mark_ready', { p_order_id: orderId })
      if (error) {
        setActionError(error.message || 'Could not mark order as ready.')
        setProcessingOrderId(null)
        return
      }
      await loadIncomingOrders(0, false)
    } catch {
      setActionError('Could not mark order as ready. Please try again.')
    }
    setProcessingOrderId(null)
    setConfirmAction(null)
  }

  async function handleMarkDelivered(orderId) {
    if (processingOrderId) return
    setProcessingOrderId(orderId)
    setActionError('')
    try {
      const { error } = await supabase.rpc('mark_delivered', { p_order_id: orderId })
      if (error) {
        setActionError(error.message || 'Could not mark order as delivered.')
        setProcessingOrderId(null)
        return
      }
      await loadIncomingOrders(0, false)
    } catch {
      setActionError('Could not mark order as delivered. Please try again.')
    }
    setProcessingOrderId(null)
    setConfirmAction(null)
  }

  function executeConfirmedAction() {
    if (!confirmAction) return
    const { orderId, action } = confirmAction
    switch (action) {
      case 'accept':  handleAcceptOrder(orderId); break
      case 'reject':  handleRejectOrder(orderId); break
      case 'ready':   handleMarkReady(orderId); break
      case 'delivered': handleMarkDelivered(orderId); break
      default: setConfirmAction(null)
    }
  }

  function toggleOrderExpanded(orderId) {
    setExpandedOrders((prev) => ({
      ...prev,
      [orderId]: !prev[orderId],
    }))
  }

  // --- Product form helpers (unchanged from before) ---
  function getFilteredSuggestions() {
    const q = productNameInput.trim().toLowerCase()
    if (!q) return COMMON_PRODUCTS.slice(0, 8)
    const startsWith = []
    const contains = []
    for (const item of COMMON_PRODUCTS) {
      const lower = item.toLowerCase()
      if (lower.startsWith(q)) startsWith.push(item)
      else if (lower.includes(q)) contains.push(item)
    }
    return [...startsWith, ...contains].slice(0, 8)
  }

  const suggestions = getFilteredSuggestions()
  const exactMatch = COMMON_PRODUCTS.find(
    (p) => p.toLowerCase() === productNameInput.trim().toLowerCase()
  )
  const showCustomOption = productNameInput.trim().length > 0 && !exactMatch

  const allComboboxOptions = [
    ...suggestions.map((name) => ({ type: 'suggestion', name })),
    ...(showCustomOption
      ? [{ type: 'custom', name: productNameInput.trim() }]
      : []),
  ]

  const typoHint = findClosestTypo(productNameInput)

  function validateTypedName(raw) {
    const trimmed = raw.trim().replace(/\s+/g, ' ')
    if (!trimmed) return { valid: false, message: 'Please enter or pick a product name.' }
    const match = COMMON_PRODUCTS.find((p) => p.toLowerCase() === trimmed.toLowerCase())
    if (match) return { valid: true, name: match }
    if (trimmed.length < 3 || trimmed.length > 60) return { valid: false, message: 'Name must be between 3 and 60 characters.' }
    const letterCount = (trimmed.match(/[a-zA-Z]/g) || []).length
    if (letterCount < 3) return { valid: false, message: 'Name must contain at least 3 letters.' }
    const allowedRegex = /^[a-zA-Z0-9\s\-&'().,/]+$/
    if (!allowedRegex.test(trimmed)) return { valid: false, message: "Only letters, numbers, spaces, and - & ' ( ) . , / are allowed." }
    if (/(.)\\1{2,}/i.test(trimmed)) return { valid: false, message: 'Name cannot have the same character repeated 3 or more times in a row.' }
    const capitalized = trimmed.charAt(0).toUpperCase() + trimmed.slice(1)
    return { valid: true, name: capitalized }
  }

  function validatePrice(val, targetUnit) {
    const strVal = val.toString().trim()
    if (!strVal) return { valid: false, message: 'Please enter a price.' }
    const parsed = parseFloat(strVal)
    if (isNaN(parsed) || parsed <= 0) return { valid: false, message: 'Price must be greater than $0.00.' }
    if (parsed > 500) return { valid: false, message: 'Price cannot exceed $500.00.' }
    const parts = strVal.split('.')
    if (parts.length === 2 && parts[1].length > 2) return { valid: false, message: 'Price can have at most 2 decimal places.' }
    const threshold = UNIT_PRICE_THRESHOLDS[targetUnit] || UNIT_PRICE_THRESHOLDS.other
    const isHigh = parsed > threshold
    return { valid: true, value: Number(parsed.toFixed(2)), isHigh, threshold }
  }

  function handleSelectOption(opt) {
    if (opt.type === 'suggestion') {
      setProductNameInput(opt.name)
      setProductNameError('')
    } else {
      const checked = validateTypedName(opt.name)
      if (checked.valid) {
        setProductNameInput(checked.name)
        setProductNameError('')
      } else {
        setProductNameInput(opt.name)
        setProductNameError(checked.message)
      }
    }
    setIsComboOpen(false)
    setActiveHighlightIndex(-1)
  }

  function handleComboKeyDown(e) {
    if (!isComboOpen && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
      setIsComboOpen(true)
      return
    }
    if (e.key === 'Escape') {
      setIsComboOpen(false)
      setActiveHighlightIndex(-1)
      return
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActiveHighlightIndex((prev) =>
        prev < allComboboxOptions.length - 1 ? prev + 1 : 0
      )
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveHighlightIndex((prev) =>
        prev > 0 ? prev - 1 : allComboboxOptions.length - 1
      )
    } else if (e.key === 'Enter') {
      if (isComboOpen && activeHighlightIndex >= 0 && allComboboxOptions[activeHighlightIndex]) {
        e.preventDefault()
        handleSelectOption(allComboboxOptions[activeHighlightIndex])
      }
    }
  }

  function handleStartAdd(e) {
    e.preventDefault()
    setFormError('')
    setProductNameError('')
    setFormSuccess('')
    setActionError('')

    const nameCheck = validateTypedName(productNameInput)
    if (!nameCheck.valid) {
      setProductNameError(nameCheck.message)
      return
    }
    const baseName = nameCheck.name

    const trimmedBrand = brand.trim()
    let finalName = baseName
    if (trimmedBrand) finalName = `${baseName} (${trimmedBrand})`

    let finalUnit = unit
    if (unit === 'other') {
      const trimmedCustomUnit = customUnit.trim()
      if (!trimmedCustomUnit) {
        setFormError('Please specify the custom unit.')
        return
      }
      finalUnit = trimmedCustomUnit
    }

    const duplicate = products.find(
      (p) =>
        p.name.trim().toLowerCase() === finalName.toLowerCase() &&
        p.unit.trim().toLowerCase() === finalUnit.toLowerCase()
    )
    if (duplicate) {
      setFormError(`You already listed ${duplicate.name} (${duplicate.unit}). Use Edit price instead.`)
      return
    }

    const priceCheck = validatePrice(price, unit)
    if (!priceCheck.valid) {
      setFormError(priceCheck.message)
      return
    }

    if (priceCheck.isHigh && !priceConfirmedHigh) {
      setFormError(`This price looks high for ${finalUnit}. Check it before saving.`)
      return
    }

    setPendingProduct({ name: finalName, price: priceCheck.value, unit: finalUnit })
  }

  async function handleConfirmAdd() {
    if (!pendingProduct) return
    setSubmitting(true)
    setFormError('')

    const { data, error } = await supabase
      .from('products')
      .insert({
        supplier_id: user.id,
        name: pendingProduct.name,
        price: pendingProduct.price,
        unit: pendingProduct.unit,
      })
      .select()
      .single()

    if (error) {
      setFormError('Could not save product. Please try again.')
      setSubmitting(false)
      return
    }

    setProducts((prev) => [data, ...prev])
    setPendingProduct(null)
    setProductNameInput('')
    setProductNameError('')
    setBrand('')
    setPrice('')
    setUnit('each')
    setCustomUnit('')
    setPriceConfirmedHigh(false)
    setFormSuccess(`"${data.name}" added successfully!`)
    setSubmitting(false)
    setTimeout(() => setFormSuccess(''), 4000)
  }

  function handleCancelConfirm() {
    setPendingProduct(null)
  }

  function startEditingPrice(product) {
    setEditingId(product.id)
    setEditPriceValue(product.price.toString())
    setEditConfirmedHigh(false)
    setEditError('')
    setActionError('')
  }

  function cancelEditingPrice() {
    setEditingId(null)
    setEditPriceValue('')
    setEditConfirmedHigh(false)
    setEditError('')
  }

  async function saveEditedPrice(product) {
    setEditError('')
    const priceCheck = validatePrice(editPriceValue, product.unit)
    if (!priceCheck.valid) {
      setEditError(priceCheck.message)
      return
    }
    if (priceCheck.isHigh && !editConfirmedHigh) {
      setEditError(`This price looks high for ${product.unit}. Check it before saving.`)
      return
    }
    setSavingEdit(true)
    const { error } = await supabase
      .from('products')
      .update({ price: priceCheck.value })
      .eq('id', product.id)

    if (error) {
      setEditError('Could not update price. Please try again.')
      setSavingEdit(false)
      return
    }
    setProducts((prev) =>
      prev.map((p) => (p.id === product.id ? { ...p, price: priceCheck.value } : p))
    )
    setSavingEdit(false)
    setEditingId(null)
  }

  async function handleDeleteProduct(product) {
    setActionError('')
    const confirmed = window.confirm(`Delete ${product.name}?`)
    if (!confirmed) return

    const { error } = await supabase
      .from('products')
      .delete()
      .eq('id', product.id)

    if (error) {
      if (error.code === '23503') {
        setActionError('This product is already in an order and can\'t be deleted.')
      } else {
        setActionError('Could not delete product. Please try again.')
      }
      return
    }
    setProducts((prev) => prev.filter((p) => p.id !== product.id))
  }

  async function handleLogout() {
    await supabase.auth.signOut()
    navigate('/login')
  }

  const currentPriceCheck = price ? validatePrice(price, unit) : null
  const showAddPriceWarning = currentPriceCheck && currentPriceCheck.valid && currentPriceCheck.isHigh

  // --- Earnings Calculations ---
  const deliveredOrders = incomingOrders.filter((o) =>
    ['delivered', 'completed'].includes(o.status)
  )
  const nowDate = new Date()
  const monthOrders = deliveredOrders.filter((o) => {
    const d = new Date(o.delivered_at || o.created_at)
    return d.getMonth() === nowDate.getMonth() && d.getFullYear() === nowDate.getFullYear()
  })
  const monthSales = monthOrders.reduce((s, o) => s + o.orderTotal, 0)
  const monthCommission = monthOrders.reduce((s, o) => s + Number(o.commission_amount || 0), 0)
  const monthNet = monthSales - monthCommission

  const inProgressOrders = incomingOrders.filter((o) => ['accepted', 'ready'].includes(o.status))
  const inProgressValue = inProgressOrders.reduce((s, o) => s + o.orderTotal, 0)
  const inProgressCommission = inProgressValue * COMMISSION_RATE

  const last7Days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date()
    d.setHours(0, 0, 0, 0)
    d.setDate(d.getDate() - (6 - i))
    return { date: d, label: d.toLocaleDateString('en-GB', { weekday: 'short' }), total: 0 }
  })
  deliveredOrders.forEach((o) => {
    const d = new Date(o.delivered_at || o.created_at)
    d.setHours(0, 0, 0, 0)
    const slot = last7Days.find((x) => x.date.getTime() === d.getTime())
    if (slot) slot.total += o.orderTotal
  })
  const maxDayTotal = Math.max(...last7Days.map((d) => d.total), 1)

  // --- Filtered Orders for display ---
  const filteredOrders = incomingOrders.filter((o) => {
    if (orderFilter === 'active') return ['pending', 'accepted', 'ready'].includes(o.status)
    if (orderFilter === 'completed') return ['delivered', 'completed'].includes(o.status)
    return true // 'all'
  })

  const pendingCount = incomingOrders.filter((o) => o.status === 'pending').length

  if (profileLoading) {
    return (
      <div style={styles.centerContainer}>
        <p style={{ color: 'var(--muted)', fontSize: '16px' }}>Loading your dashboard...</p>
      </div>
    )
  }

  return (
    <div style={styles.page}>
      <header style={styles.header}>
        <div style={styles.brandRow}>
          <h1 style={styles.logo}>{APP_NAME}</h1>
          <span style={styles.badge}>Supplier Portal</span>
        </div>
        <button onClick={handleLogout} style={styles.logoutBtn}>
          Log Out
        </button>
      </header>

      <main style={styles.main}>
        {/* Welcome Card */}
        <div style={styles.welcomeCard}>
          <h2 style={styles.greeting}>
            {formatFirstName(profile?.full_name)
              ? `Welcome, ${formatFirstName(profile?.full_name)}!`
              : 'Welcome!'}
          </h2>
          <p style={styles.subtext}>
            Manage orders, products and earnings from your supplier dashboard.
          </p>
        </div>

        {/* Global Action Error */}
        {actionError && (
          <div style={styles.alertError}>
            <span>{actionError}</span>
            <button
              type="button"
              onClick={() => setActionError('')}
              style={styles.dismissErrorBtn}
            >
              ✕
            </button>
          </div>
        )}

        {/* Navigation Tabs */}
        <nav style={styles.tabsNav} aria-label="Supplier Navigation">
          <button
            type="button"
            onClick={() => setActiveTab('orders')}
            style={{
              ...styles.tabBtn,
              ...(activeTab === 'orders' ? styles.tabBtnActive : {}),
            }}
          >
            Orders
            {pendingCount > 0 && (
              <span style={styles.tabBadge}>{pendingCount}</span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('products')}
            style={{
              ...styles.tabBtn,
              ...(activeTab === 'products' ? styles.tabBtnActive : {}),
            }}
          >
            Products
            {products.length > 0 && (
              <span style={styles.tabBadgeGrey}>{products.length}</span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('earnings')}
            style={{
              ...styles.tabBtn,
              ...(activeTab === 'earnings' ? styles.tabBtnActive : {}),
            }}
          >
            Earnings
          </button>
        </nav>

        {/* ========================================================= */}
        {/* TAB 1: INCOMING ORDERS (SUPPLIER INBOX)                   */}
        {/* ========================================================= */}
        {activeTab === 'orders' && (
          <section style={styles.sectionCard}>
            <div style={styles.sectionHeader}>
              <h3 style={styles.sectionTitle}>Incoming Orders</h3>
              <button
                type="button"
                onClick={() => loadIncomingOrders(0, false)}
                style={styles.refreshBtn}
                disabled={ordersLoading}
              >
                {ordersLoading ? 'Refreshing...' : '🔄 Refresh'}
              </button>
            </div>

            {/* Filter Pills */}
            <div style={styles.filterRow}>
              {[
                { key: 'active', label: 'Active' },
                { key: 'completed', label: 'Completed' },
                { key: 'all', label: 'All' },
              ].map((f) => (
                <button
                  key={f.key}
                  type="button"
                  onClick={() => setOrderFilter(f.key)}
                  style={{
                    ...styles.filterPill,
                    ...(orderFilter === f.key ? styles.filterPillActive : {}),
                  }}
                >
                  {f.label}
                </button>
              ))}
            </div>

            {ordersLoading && incomingOrders.length === 0 && (
              <div style={styles.stateBox}>
                <p style={{ color: 'var(--muted)' }}>Loading incoming orders...</p>
              </div>
            )}

            {ordersError && incomingOrders.length === 0 && (
              <div style={styles.stateBox}>
                <p style={{ color: 'var(--error)', marginBottom: '10px' }}>{ordersError}</p>
                <button type="button" onClick={() => loadIncomingOrders(0, false)} style={styles.retryBtn}>
                  Try again
                </button>
              </div>
            )}

            {!ordersLoading && !ordersError && filteredOrders.length === 0 && (
              <div style={styles.stateBox}>
                <p style={{ color: 'var(--muted)' }}>
                  {orderFilter === 'active'
                    ? 'No active orders right now.'
                    : orderFilter === 'completed'
                    ? 'No completed orders yet.'
                    : 'No incoming orders yet.'}
                </p>
              </div>
            )}

            {filteredOrders.length > 0 && (
              <div style={styles.orderList}>
                {filteredOrders.map((order) => {
                  const statusInfo = STATUS_CONFIG[order.status] || STATUS_CONFIG.pending
                  const isExpanded = !!expandedOrders[order.id]
                  const contact = orderContacts[order.id]
                  const isProcessing = processingOrderId === order.id
                  const formattedDate = order.created_at
                    ? new Date(order.created_at).toLocaleString()
                    : ''

                  // Get shop name: from contacts if accepted+, otherwise "Shop"
                  const shopDisplayName = contact?.business_name || 'Shop'

                  return (
                    <div key={order.id} style={styles.orderCard}>
                      {/* Order Header */}
                      <div style={styles.orderHeaderRow}>
                        <div>
                          <h4 style={styles.orderTitle}>{shopDisplayName}</h4>
                          <span style={styles.orderMeta}>{formattedDate}</span>
                          <span style={styles.orderRef}>
                            #{order.id.substring(0, 8).toUpperCase()}
                          </span>
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

                      {/* Order Items - always visible */}
                      <div style={styles.orderItemSummary}>
                        {(isExpanded
                          ? order.order_items
                          : (order.order_items || []).slice(0, 3)
                        )?.map((item) => (
                          <div key={item.id} style={styles.orderLineItem}>
                            <span>
                              {item.quantity} × {item.products?.name || 'Product'} ({item.products?.unit})
                            </span>
                            <span>${(Number(item.unit_price) * item.quantity).toFixed(2)}</span>
                          </div>
                        ))}

                        {!isExpanded && (order.order_items || []).length > 3 && (
                          <button
                            type="button"
                            onClick={() => toggleOrderExpanded(order.id)}
                            style={styles.showMoreBtn}
                          >
                            + {order.order_items.length - 3} more items
                          </button>
                        )}

                        {isExpanded && (order.order_items || []).length > 3 && (
                          <button
                            type="button"
                            onClick={() => toggleOrderExpanded(order.id)}
                            style={styles.showMoreBtn}
                          >
                            Show less ▲
                          </button>
                        )}

                        <div style={styles.orderTotalRow}>
                          <strong>Total</strong>
                          <strong>${Number(order.orderTotal).toFixed(2)}</strong>
                        </div>

                        {order.commission_amount > 0 && (
                          <div style={styles.commissionRow}>
                            <span>Commission ({Math.round(COMMISSION_RATE * 100)}%)</span>
                            <span>-${Number(order.commission_amount).toFixed(2)}</span>
                          </div>
                        )}
                      </div>

                      {/* Note */}
                      {order.note && (
                        <p style={styles.orderNote}>📝 Note: &ldquo;{order.note}&rdquo;</p>
                      )}

                      {/* Shop Contact - shown for accepted and beyond */}
                      {contact && ['accepted', 'ready', 'delivered', 'completed'].includes(order.status) && (
                        <div style={styles.contactBox}>
                          <p style={styles.contactLabel}>Shop contact</p>
                          <p style={styles.contactValue}>
                            <strong>{contact.business_name}</strong>
                          </p>
                          <p style={styles.contactPhone}>📞 {contact.phone}</p>
                        </div>
                      )}

                      {/* Action Buttons */}
                      {order.status === 'pending' && (
                        <div style={styles.orderActions}>
                          {confirmAction?.orderId === order.id ? (
                            <div style={styles.confirmActionBox}>
                              <p style={styles.confirmActionText}>
                                {confirmAction.action === 'accept'
                                  ? 'Accept this order? The shop will be notified.'
                                  : 'Decline this order? This cannot be undone.'}
                              </p>
                              <div style={styles.confirmActionBtns}>
                                <button
                                  type="button"
                                  onClick={executeConfirmedAction}
                                  disabled={isProcessing}
                                  style={
                                    confirmAction.action === 'accept'
                                      ? styles.confirmBtn
                                      : styles.confirmRejectBtn
                                  }
                                >
                                  {isProcessing
                                    ? 'Processing...'
                                    : confirmAction.action === 'accept'
                                    ? 'Yes, accept'
                                    : 'Yes, decline'}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setConfirmAction(null)}
                                  disabled={isProcessing}
                                  style={styles.cancelActionBtn}
                                >
                                  Cancel
                                </button>
                              </div>
                            </div>
                          ) : (
                            <>
                              <button
                                type="button"
                                onClick={() =>
                                  setConfirmAction({
                                    orderId: order.id,
                                    action: 'accept',
                                    label: 'Accept',
                                  })
                                }
                                style={styles.acceptBtn}
                              >
                                ✓ Accept
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  setConfirmAction({
                                    orderId: order.id,
                                    action: 'reject',
                                    label: 'Decline',
                                  })
                                }
                                style={styles.rejectBtn}
                              >
                                ✕ Decline
                              </button>
                            </>
                          )}
                        </div>
                      )}

                      {order.status === 'accepted' && (
                        <div style={styles.orderActions}>
                          {confirmAction?.orderId === order.id && confirmAction.action === 'ready' ? (
                            <div style={styles.confirmActionBox}>
                              <p style={styles.confirmActionText}>
                                Mark this order as ready for pickup/delivery?
                              </p>
                              <div style={styles.confirmActionBtns}>
                                <button
                                  type="button"
                                  onClick={executeConfirmedAction}
                                  disabled={isProcessing}
                                  style={styles.readyConfirmBtn}
                                >
                                  {isProcessing ? 'Processing...' : 'Yes, mark ready'}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setConfirmAction(null)}
                                  disabled={isProcessing}
                                  style={styles.cancelActionBtn}
                                >
                                  Cancel
                                </button>
                              </div>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() =>
                                setConfirmAction({
                                  orderId: order.id,
                                  action: 'ready',
                                  label: 'Mark ready',
                                })
                              }
                              style={styles.readyBtn}
                            >
                              📦 Mark ready
                            </button>
                          )}
                        </div>
                      )}

                      {order.status === 'ready' && (
                        <div style={styles.orderActions}>
                          {confirmAction?.orderId === order.id && confirmAction.action === 'delivered' ? (
                            <div style={styles.confirmActionBox}>
                              <p style={styles.confirmActionText}>
                                Confirm this order has been delivered?
                              </p>
                              <div style={styles.confirmActionBtns}>
                                <button
                                  type="button"
                                  onClick={executeConfirmedAction}
                                  disabled={isProcessing}
                                  style={styles.deliverConfirmBtn}
                                >
                                  {isProcessing ? 'Processing...' : 'Yes, delivered'}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setConfirmAction(null)}
                                  disabled={isProcessing}
                                  style={styles.cancelActionBtn}
                                >
                                  Cancel
                                </button>
                              </div>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() =>
                                setConfirmAction({
                                  orderId: order.id,
                                  action: 'delivered',
                                  label: 'Mark delivered',
                                })
                              }
                              style={styles.deliverBtn}
                            >
                              🚚 Mark delivered
                            </button>
                          )}
                        </div>
                      )}

                      {order.status === 'delivered' && (
                        <p style={styles.waitingConfirmText}>
                          Waiting for shop to confirm receipt...
                        </p>
                      )}

                      {order.status === 'completed' && (
                        <p style={styles.completedText}>
                          ✅ Shop confirmed receipt
                        </p>
                      )}
                    </div>
                  )
                })}

                {hasMoreOrders && orderFilter === 'all' && (
                  <button
                    type="button"
                    onClick={() => loadIncomingOrders(ordersPage + 1, true)}
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

        {/* ========================================================= */}
        {/* TAB 2: PRODUCTS (ADD + CATALOGUE)                         */}
        {/* ========================================================= */}
        {activeTab === 'products' && (
          <>
            {/* Add Product Section */}
            <section style={styles.sectionCard}>
              <h3 style={styles.sectionTitle}>Add New Product</h3>

              {pendingProduct ? (
                <div style={styles.confirmBox}>
                  <h4 style={styles.confirmTitle}>Please confirm product details:</h4>
                  <p style={styles.confirmText}>
                    Add: <strong>{pendingProduct.name}</strong>,{' '}
                    <strong style={{ color: 'var(--green)' }}>
                      ${Number(pendingProduct.price).toFixed(2)}
                    </strong>{' '}
                    per <strong>{pendingProduct.unit}</strong>?
                  </p>
                  <div style={styles.confirmActions}>
                    <button
                      type="button"
                      onClick={handleConfirmAdd}
                      disabled={submitting}
                      style={styles.confirmBtn}
                    >
                      {submitting ? 'Saving...' : 'Confirm & Save'}
                    </button>
                    <button
                      type="button"
                      onClick={handleCancelConfirm}
                      disabled={submitting}
                      style={styles.changeBtn}
                    >
                      Change
                    </button>
                  </div>
                </div>
              ) : (
                <form onSubmit={handleStartAdd} style={styles.form}>
                  {/* Product Combobox */}
                  <div style={styles.fieldGroup} ref={comboRef}>
                    <label htmlFor="prod-picker-input" style={styles.label}>
                      Product Name
                    </label>
                    <div style={styles.comboWrapper}>
                      <input
                        id="prod-picker-input"
                        role="combobox"
                        aria-expanded={isComboOpen}
                        aria-haspopup="listbox"
                        aria-autocomplete="list"
                        autoComplete="off"
                        style={{
                          ...styles.input,
                          ...(productNameError ? styles.inputError : {}),
                        }}
                        type="text"
                        value={productNameInput}
                        onChange={(e) => {
                          setProductNameInput(e.target.value)
                          setProductNameError('')
                          setIsComboOpen(true)
                          setActiveHighlightIndex(-1)
                        }}
                        onFocus={() => setIsComboOpen(true)}
                        onKeyDown={handleComboKeyDown}
                        placeholder="Type or pick a product (e.g. Sugar)"
                        required
                      />

                      {isComboOpen && allComboboxOptions.length > 0 && (
                        <ul role="listbox" style={styles.comboList}>
                          {allComboboxOptions.map((opt, idx) => {
                            const isHighlighted = idx === activeHighlightIndex
                            if (opt.type === 'suggestion') {
                              return (
                                <li
                                  key={`sugg-${opt.name}`}
                                  role="option"
                                  aria-selected={isHighlighted}
                                  onMouseDown={() => handleSelectOption(opt)}
                                  style={{
                                    ...styles.comboItem,
                                    ...(isHighlighted ? styles.comboItemHighlighted : {}),
                                  }}
                                >
                                  {opt.name}
                                </li>
                              )
                            } else {
                              return (
                                <li
                                  key="custom-choice"
                                  role="option"
                                  aria-selected={isHighlighted}
                                  onMouseDown={() => handleSelectOption(opt)}
                                  style={{
                                    ...styles.comboItem,
                                    ...styles.comboItemCustom,
                                    ...(isHighlighted ? styles.comboItemHighlighted : {}),
                                  }}
                                >
                                  Use &ldquo;<strong>{opt.name}</strong>&rdquo; as a new product
                                </li>
                              )
                            }
                          })}
                        </ul>
                      )}
                    </div>

                    {typoHint && (
                      <p style={styles.typoHintText}>
                        Did you mean{' '}
                        <button
                          type="button"
                          onClick={() => {
                            setProductNameInput(typoHint)
                            setProductNameError('')
                            setIsComboOpen(false)
                          }}
                          style={styles.typoHintBtn}
                        >
                          {typoHint}
                        </button>
                        ?
                      </p>
                    )}

                    {productNameError && (
                      <p style={styles.fieldError}>{productNameError}</p>
                    )}
                  </div>

                  {/* Optional Brand */}
                  <div style={styles.fieldGroup}>
                    <label htmlFor="prod-brand" style={styles.label}>
                      Brand / Description <span style={styles.optionalText}>(optional)</span>
                    </label>
                    <input
                      id="prod-brand"
                      style={styles.input}
                      type="text"
                      value={brand}
                      onChange={(e) => setBrand(e.target.value)}
                      maxLength={40}
                      placeholder="e.g. Pure Gold, Gloria, Red Seal"
                    />
                  </div>

                  {/* Price and Unit Row */}
                  <div style={styles.rowFields}>
                    <div style={{ ...styles.fieldGroup, flex: 1 }}>
                      <label htmlFor="prod-price" style={styles.label}>
                        Price (USD)
                      </label>
                      <input
                        id="prod-price"
                        style={styles.input}
                        type="number"
                        step="0.01"
                        min="0.01"
                        max="500"
                        value={price}
                        onChange={(e) => {
                          setPrice(e.target.value)
                          setPriceConfirmedHigh(false)
                        }}
                        required
                        placeholder="e.g. 3.50"
                      />
                    </div>

                    <div style={{ ...styles.fieldGroup, flex: 1 }}>
                      <label htmlFor="prod-unit" style={styles.label}>
                        Unit
                      </label>
                      <select
                        id="prod-unit"
                        style={styles.select}
                        value={unit}
                        onChange={(e) => {
                          setUnit(e.target.value)
                          setPriceConfirmedHigh(false)
                        }}
                      >
                        {UNIT_OPTIONS.map((opt) => (
                          <option key={opt} value={opt}>
                            {opt}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {unit === 'other' && (
                    <div style={styles.fieldGroup}>
                      <label htmlFor="prod-custom-unit" style={styles.label}>
                        Specify Custom Unit
                      </label>
                      <input
                        id="prod-custom-unit"
                        style={styles.input}
                        type="text"
                        value={customUnit}
                        onChange={(e) => setCustomUnit(e.target.value)}
                        required
                        placeholder="e.g. bundle, sack, crate"
                      />
                    </div>
                  )}

                  {showAddPriceWarning && (
                    <div style={styles.amberWarningBox}>
                      <p style={styles.amberWarningText}>
                        ⚠️ This price looks high for {unit === 'other' && customUnit ? customUnit : unit} (typical max is ${currentPriceCheck.threshold}). Check it before saving.
                      </p>
                      <label style={styles.checkboxLabel}>
                        <input
                          type="checkbox"
                          checked={priceConfirmedHigh}
                          onChange={(e) => setPriceConfirmedHigh(e.target.checked)}
                          style={styles.checkbox}
                        />
                        <span>Yes, the price is correct</span>
                      </label>
                    </div>
                  )}

                  {formError && <p style={styles.formError}>{formError}</p>}
                  {formSuccess && <p style={styles.formSuccess}>{formSuccess}</p>}

                  <button
                    type="submit"
                    disabled={submitting}
                    style={{
                      ...styles.submitBtn,
                      ...(submitting ? styles.btnDisabled : {}),
                    }}
                  >
                    Add Product
                  </button>
                </form>
              )}
            </section>

            {/* Product Catalog Section */}
            <section style={styles.sectionCard}>
              <div style={styles.catalogHeader}>
                <h3 style={styles.sectionTitle}>Your Products</h3>
                <span style={styles.countBadge}>{products.length} listed</span>
              </div>

              {productsLoading && (
                <div style={styles.stateBox}>
                  <p style={{ color: 'var(--muted)' }}>Loading your products...</p>
                </div>
              )}

              {productsError && !productsLoading && (
                <div style={styles.stateBox}>
                  <p style={{ color: 'var(--error)', marginBottom: '10px' }}>{productsError}</p>
                  <button
                    type="button"
                    onClick={() => user && loadProducts(user.id)}
                    style={styles.retryBtn}
                  >
                    Try again
                  </button>
                </div>
              )}

              {!productsLoading && !productsError && products.length === 0 && (
                <div style={styles.stateBox}>
                  <p style={{ color: 'var(--muted)' }}>
                    No products yet. Add your first product above.
                  </p>
                </div>
              )}

              {!productsLoading && !productsError && products.length > 0 && (
                <div style={styles.productList}>
                  {products.map((prod) => {
                    const isEditing = editingId === prod.id
                    const editPriceCheck = isEditing && editPriceValue ? validatePrice(editPriceValue, prod.unit) : null
                    const showEditHighWarning = editPriceCheck && editPriceCheck.valid && editPriceCheck.isHigh

                    return (
                      <div key={prod.id} style={styles.productCard}>
                        <div style={styles.prodInfo}>
                          <h4 style={styles.prodName}>{prod.name}</h4>
                          <div style={styles.priceRow}>
                            {isEditing ? (
                              <div style={styles.editContainer}>
                                <div style={styles.editRow}>
                                  <input
                                    type="number"
                                    step="0.01"
                                    min="0.01"
                                    max="500"
                                    value={editPriceValue}
                                    onChange={(e) => {
                                      setEditPriceValue(e.target.value)
                                      setEditConfirmedHigh(false)
                                    }}
                                    style={styles.editInput}
                                    placeholder="0.00"
                                    autoFocus
                                  />
                                  <span style={styles.unitText}>/ {prod.unit}</span>
                                  <button
                                    type="button"
                                    onClick={() => saveEditedPrice(prod)}
                                    disabled={savingEdit}
                                    style={styles.saveBtn}
                                  >
                                    {savingEdit ? '...' : 'Save'}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={cancelEditingPrice}
                                    disabled={savingEdit}
                                    style={styles.cancelBtn}
                                  >
                                    Cancel
                                  </button>
                                </div>

                                {showEditHighWarning && (
                                  <div style={styles.editAmberWarningBox}>
                                    <p style={styles.amberWarningText}>
                                      ⚠️ This price looks high for {prod.unit}. Check it before saving.
                                    </p>
                                    <label style={styles.checkboxLabel}>
                                      <input
                                        type="checkbox"
                                        checked={editConfirmedHigh}
                                        onChange={(e) => setEditConfirmedHigh(e.target.checked)}
                                        style={styles.checkbox}
                                      />
                                      <span>Yes, the price is correct</span>
                                    </label>
                                  </div>
                                )}

                                {editError && <p style={styles.editErrorText}>{editError}</p>}
                              </div>
                            ) : (
                              <>
                                <span style={styles.priceTag}>
                                  ${Number(prod.price).toFixed(2)}
                                </span>
                                <span style={styles.unitText}>/ {prod.unit}</span>
                              </>
                            )}
                          </div>
                        </div>

                        {!isEditing && (
                          <div style={styles.actionBtns}>
                            <button
                              type="button"
                              onClick={() => startEditingPrice(prod)}
                              style={styles.editPriceBtn}
                            >
                              Edit price
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteProduct(prod)}
                              style={styles.deleteBtn}
                            >
                              Delete
                            </button>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </section>
          </>
        )}

        {/* ========================================================= */}
        {/* TAB 3: EARNINGS & COMMISSION                               */}
        {/* ========================================================= */}
        {activeTab === 'earnings' && (
          <section style={styles.sectionCard}>
            <div style={styles.catalogHeader}>
              <h3 style={styles.sectionTitle}>Earnings &amp; Commission</h3>
              <span style={styles.countBadge}>This month</span>
            </div>

            <div style={styles.statGrid}>
              <div style={styles.statBox}>
                <span style={styles.statLabel}>Sales</span>
                <span style={styles.statValue}>${monthSales.toFixed(2)}</span>
              </div>
              <div style={styles.statBox}>
                <span style={styles.statLabel}>Commission ({Math.round(COMMISSION_RATE * 100)}%)</span>
                <span style={{ ...styles.statValue, color: '#B45309' }}>
                  ${monthCommission.toFixed(2)}
                </span>
              </div>
              <div style={styles.statBox}>
                <span style={styles.statLabel}>You keep</span>
                <span style={{ ...styles.statValue, color: 'var(--green)' }}>
                  ${monthNet.toFixed(2)}
                </span>
              </div>
              <div style={styles.statBox}>
                <span style={styles.statLabel}>Delivered orders</span>
                <span style={styles.statValue}>{monthOrders.length}</span>
              </div>
            </div>

            {inProgressOrders.length > 0 && (
              <p style={styles.inProgressText}>
                In progress: {inProgressOrders.length} order{inProgressOrders.length > 1 ? 's' : ''} worth $
                {inProgressValue.toFixed(2)} (estimated commission ${inProgressCommission.toFixed(2)})
              </p>
            )}

            <h4 style={styles.chartTitle}>Delivered sales, last 7 days</h4>
            <div style={styles.chartRow}>
              {last7Days.map((d) => (
                <div key={d.label + d.date.getTime()} style={styles.chartCol}>
                  <span style={styles.chartValue}>{d.total > 0 ? `$${d.total.toFixed(0)}` : ''}</span>
                  <div style={styles.chartBarTrack}>
                    <div
                      style={{
                        ...styles.chartBar,
                        height: `${Math.max((d.total / maxDayTotal) * 100, d.total > 0 ? 6 : 0)}%`,
                      }}
                    />
                  </div>
                  <span style={styles.chartLabel}>{d.label}</span>
                </div>
              ))}
            </div>

            <p style={styles.chartFootnote}>
              Commission is calculated when you mark an order as delivered. You receive a monthly statement.
            </p>
          </section>
        )}
      </main>

      {/* Confirm Action Modal Overlay */}
      {confirmAction && !['pending', 'accepted', 'ready'].some(
        (s) => filteredOrders.find((o) => o.id === confirmAction.orderId && o.status === s)
      ) && (
        // Close stale confirm if order status changed
        <>{setConfirmAction(null)}</>
      )}
    </div>
  )
}

// ===========================================================================
// STYLES
// ===========================================================================

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
  alertError: {
    backgroundColor: '#FEE2E2',
    color: 'var(--error)',
    padding: '12px 16px',
    borderRadius: '8px',
    border: '1px solid #FCA5A5',
    fontSize: '14px',
    fontWeight: '500',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  dismissErrorBtn: {
    background: 'none',
    border: 'none',
    color: 'var(--error)',
    fontSize: '16px',
    fontWeight: '700',
    cursor: 'pointer',
    padding: '4px 8px',
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
  tabBadgeGrey: {
    backgroundColor: 'var(--border)',
    color: 'var(--text)',
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
    marginBottom: '12px',
  },
  sectionTitle: {
    margin: '0 0 4px',
    fontSize: '18px',
    fontWeight: '700',
    color: 'var(--text)',
  },
  // --- Filter pills ---
  filterRow: {
    display: 'flex',
    gap: '8px',
    marginBottom: '16px',
  },
  filterPill: {
    padding: '6px 14px',
    borderRadius: '20px',
    border: '1px solid var(--border)',
    backgroundColor: 'var(--card)',
    color: 'var(--muted)',
    fontSize: '13px',
    fontWeight: '600',
    cursor: 'pointer',
    minHeight: '36px',
    display: 'inline-flex',
    alignItems: 'center',
  },
  filterPillActive: {
    backgroundColor: 'var(--green)',
    color: '#ffffff',
    borderColor: 'var(--green)',
  },
  // --- Order list ---
  orderList: {
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
  orderTitle: {
    margin: '0 0 2px',
    fontSize: '17px',
    fontWeight: '700',
    color: 'var(--text)',
  },
  orderMeta: {
    fontSize: '12px',
    color: 'var(--muted)',
    display: 'block',
  },
  orderRef: {
    fontSize: '11px',
    color: 'var(--muted)',
    fontFamily: 'monospace',
    display: 'block',
    marginTop: '2px',
  },
  statusBadge: {
    fontSize: '12px',
    fontWeight: '700',
    padding: '3px 9px',
    borderRadius: '12px',
    border: '1px solid transparent',
    whiteSpace: 'nowrap',
  },
  orderItemSummary: {
    backgroundColor: 'var(--bg)',
    borderRadius: '8px',
    padding: '12px',
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
  },
  orderLineItem: {
    display: 'flex',
    justifyContent: 'space-between',
    fontSize: '14px',
    color: 'var(--text)',
  },
  showMoreBtn: {
    background: 'none',
    border: 'none',
    color: 'var(--green)',
    fontWeight: '600',
    fontSize: '13px',
    cursor: 'pointer',
    padding: '4px 0',
    textAlign: 'left',
  },
  orderTotalRow: {
    display: 'flex',
    justifyContent: 'space-between',
    fontSize: '15px',
    color: 'var(--text)',
    borderTop: '1px solid var(--border)',
    paddingTop: '8px',
    marginTop: '4px',
  },
  commissionRow: {
    display: 'flex',
    justifyContent: 'space-between',
    fontSize: '13px',
    color: '#B45309',
  },
  orderNote: {
    margin: 0,
    fontSize: '13px',
    color: 'var(--muted)',
    fontStyle: 'italic',
  },
  // --- Contact Box ---
  contactBox: {
    backgroundColor: '#DCFCE7',
    border: '1px solid #22C55E',
    borderRadius: '8px',
    padding: '12px',
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
  },
  contactLabel: {
    margin: 0,
    fontSize: '12px',
    fontWeight: '600',
    color: '#166534',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
  },
  contactValue: {
    margin: 0,
    fontSize: '15px',
    color: '#166534',
  },
  contactPhone: {
    margin: 0,
    fontSize: '15px',
    fontWeight: '700',
    color: '#166534',
  },
  // --- Order Actions ---
  orderActions: {
    display: 'flex',
    gap: '10px',
    flexWrap: 'wrap',
  },
  acceptBtn: {
    flex: 1,
    minHeight: '44px',
    padding: '0 16px',
    backgroundColor: 'var(--green)',
    color: '#ffffff',
    border: 'none',
    borderRadius: '8px',
    fontSize: '15px',
    fontWeight: '700',
    cursor: 'pointer',
  },
  rejectBtn: {
    minHeight: '44px',
    padding: '0 16px',
    backgroundColor: 'transparent',
    color: 'var(--error)',
    border: '1px solid #FCA5A5',
    borderRadius: '8px',
    fontSize: '15px',
    fontWeight: '600',
    cursor: 'pointer',
  },
  readyBtn: {
    flex: 1,
    minHeight: '44px',
    padding: '0 16px',
    backgroundColor: '#2563EB',
    color: '#ffffff',
    border: 'none',
    borderRadius: '8px',
    fontSize: '15px',
    fontWeight: '700',
    cursor: 'pointer',
  },
  deliverBtn: {
    flex: 1,
    minHeight: '44px',
    padding: '0 16px',
    backgroundColor: '#059669',
    color: '#ffffff',
    border: 'none',
    borderRadius: '8px',
    fontSize: '15px',
    fontWeight: '700',
    cursor: 'pointer',
  },
  // --- Confirm Action inline ---
  confirmActionBox: {
    width: '100%',
    backgroundColor: 'var(--bg)',
    border: '2px solid var(--green)',
    borderRadius: '10px',
    padding: '14px',
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
  },
  confirmActionText: {
    margin: 0,
    fontSize: '15px',
    color: 'var(--text)',
    lineHeight: 1.4,
  },
  confirmActionBtns: {
    display: 'flex',
    gap: '10px',
    flexWrap: 'wrap',
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
  confirmRejectBtn: {
    minHeight: '44px',
    padding: '0 20px',
    backgroundColor: 'var(--error)',
    color: '#ffffff',
    border: 'none',
    borderRadius: '8px',
    fontSize: '15px',
    fontWeight: '700',
    cursor: 'pointer',
  },
  readyConfirmBtn: {
    minHeight: '44px',
    padding: '0 20px',
    backgroundColor: '#2563EB',
    color: '#ffffff',
    border: 'none',
    borderRadius: '8px',
    fontSize: '15px',
    fontWeight: '700',
    cursor: 'pointer',
  },
  deliverConfirmBtn: {
    minHeight: '44px',
    padding: '0 20px',
    backgroundColor: '#059669',
    color: '#ffffff',
    border: 'none',
    borderRadius: '8px',
    fontSize: '15px',
    fontWeight: '700',
    cursor: 'pointer',
  },
  cancelActionBtn: {
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
  waitingConfirmText: {
    margin: 0,
    fontSize: '13px',
    color: 'var(--muted)',
    fontStyle: 'italic',
    padding: '6px 0',
  },
  completedText: {
    margin: 0,
    fontSize: '14px',
    fontWeight: '600',
    color: '#0F766E',
    padding: '6px 0',
  },
  // --- Refresh & Load More ---
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
  // --- Earnings ---
  catalogHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '16px',
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
  statGrid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '12px',
    marginBottom: '16px',
  },
  statBox: {
    backgroundColor: 'var(--bg)',
    borderRadius: '10px',
    padding: '14px',
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
    border: '1px solid var(--border)',
  },
  statLabel: {
    fontSize: '12px',
    fontWeight: '600',
    color: 'var(--muted)',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
  },
  statValue: {
    fontSize: '22px',
    fontWeight: '700',
    color: 'var(--text)',
  },
  inProgressText: {
    margin: '0 0 16px',
    fontSize: '14px',
    color: 'var(--muted)',
    lineHeight: 1.5,
  },
  chartTitle: {
    margin: '0 0 12px',
    fontSize: '15px',
    fontWeight: '700',
    color: 'var(--text)',
  },
  chartRow: {
    display: 'flex',
    gap: '6px',
    alignItems: 'flex-end',
    height: '120px',
    marginBottom: '8px',
  },
  chartCol: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '4px',
    height: '100%',
  },
  chartValue: {
    fontSize: '11px',
    fontWeight: '600',
    color: 'var(--muted)',
    minHeight: '16px',
  },
  chartBarTrack: {
    flex: 1,
    width: '100%',
    backgroundColor: 'var(--bg)',
    borderRadius: '4px',
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'flex-end',
    overflow: 'hidden',
  },
  chartBar: {
    width: '100%',
    backgroundColor: 'var(--green)',
    borderRadius: '4px 4px 0 0',
    transition: 'height 0.3s ease',
  },
  chartLabel: {
    fontSize: '11px',
    color: 'var(--muted)',
    fontWeight: '600',
  },
  chartFootnote: {
    margin: '8px 0 0',
    fontSize: '12px',
    color: 'var(--muted)',
    lineHeight: 1.5,
  },
  // --- Product form styles ---
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: '14px',
  },
  fieldGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
    position: 'relative',
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
  inputError: {
    borderColor: 'var(--error)',
  },
  select: {
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
    appearance: 'auto',
  },
  rowFields: {
    display: 'flex',
    gap: '12px',
  },
  comboWrapper: {
    position: 'relative',
    width: '100%',
  },
  comboList: {
    position: 'absolute',
    top: 'calc(100% + 4px)',
    left: 0,
    right: 0,
    maxHeight: '240px',
    overflowY: 'auto',
    backgroundColor: 'var(--card)',
    border: '1px solid var(--border)',
    borderRadius: '8px',
    boxShadow: '0 6px 20px rgba(0, 0, 0, 0.12)',
    zIndex: 10,
    listStyle: 'none',
    margin: 0,
    padding: '4px 0',
  },
  comboItem: {
    padding: '12px 14px',
    fontSize: '16px',
    color: 'var(--text)',
    cursor: 'pointer',
    minHeight: '44px',
    display: 'flex',
    alignItems: 'center',
  },
  comboItemHighlighted: {
    backgroundColor: 'var(--bg)',
  },
  comboItemCustom: {
    color: 'var(--green)',
    fontWeight: '600',
    borderTop: '1px solid var(--border)',
  },
  typoHintText: {
    margin: '4px 0 0',
    fontSize: '13px',
    color: 'var(--muted)',
  },
  typoHintBtn: {
    background: 'none',
    border: 'none',
    color: 'var(--green)',
    fontWeight: '700',
    cursor: 'pointer',
    fontSize: '13px',
    padding: 0,
    textDecoration: 'underline',
  },
  fieldError: {
    color: 'var(--error)',
    fontSize: '13px',
    margin: '2px 0 0',
  },
  formError: {
    color: 'var(--error)',
    fontSize: '13px',
    margin: 0,
  },
  formSuccess: {
    color: 'var(--success)',
    fontSize: '14px',
    fontWeight: '600',
    margin: 0,
  },
  amberWarningBox: {
    backgroundColor: 'var(--amber-light)',
    border: '1px solid var(--amber)',
    borderRadius: '8px',
    padding: '12px',
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  amberWarningText: {
    margin: 0,
    fontSize: '14px',
    color: '#92400E',
    lineHeight: 1.5,
  },
  checkboxLabel: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    fontSize: '14px',
    color: 'var(--text)',
    cursor: 'pointer',
    minHeight: '44px',
  },
  checkbox: {
    width: '20px',
    height: '20px',
    accentColor: 'var(--green)',
  },
  submitBtn: {
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
  btnDisabled: {
    opacity: 0.6,
    cursor: 'not-allowed',
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
  confirmActions: {
    display: 'flex',
    gap: '10px',
    flexWrap: 'wrap',
    marginTop: '6px',
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
  // --- Product list styles ---
  productList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
  },
  productCard: {
    border: '1px solid var(--border)',
    borderRadius: '10px',
    padding: '14px',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: '10px',
    flexWrap: 'wrap',
    backgroundColor: 'var(--card)',
  },
  prodInfo: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
    flex: 1,
    minWidth: 0,
  },
  prodName: {
    margin: 0,
    fontSize: '16px',
    fontWeight: '700',
    color: 'var(--text)',
  },
  priceRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    flexWrap: 'wrap',
  },
  priceTag: {
    fontSize: '18px',
    fontWeight: '700',
    color: 'var(--green)',
  },
  unitText: {
    fontSize: '14px',
    color: 'var(--muted)',
  },
  actionBtns: {
    display: 'flex',
    gap: '8px',
    flexShrink: 0,
  },
  editPriceBtn: {
    minHeight: '40px',
    padding: '0 12px',
    backgroundColor: 'transparent',
    border: '1px solid var(--green)',
    color: 'var(--green)',
    borderRadius: '6px',
    fontSize: '13px',
    fontWeight: '600',
    cursor: 'pointer',
  },
  deleteBtn: {
    minHeight: '40px',
    padding: '0 12px',
    backgroundColor: 'transparent',
    border: '1px solid #FCA5A5',
    color: 'var(--error)',
    borderRadius: '6px',
    fontSize: '13px',
    fontWeight: '600',
    cursor: 'pointer',
  },
  editContainer: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    width: '100%',
  },
  editRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    flexWrap: 'wrap',
  },
  editInput: {
    width: '90px',
    height: '40px',
    fontSize: '16px',
    padding: '0 10px',
    borderRadius: '6px',
    border: '1px solid var(--border)',
    color: 'var(--text)',
    backgroundColor: 'var(--card)',
    boxSizing: 'border-box',
    outline: 'none',
    textAlign: 'center',
  },
  saveBtn: {
    minHeight: '40px',
    padding: '0 14px',
    backgroundColor: 'var(--green)',
    color: '#ffffff',
    border: 'none',
    borderRadius: '6px',
    fontSize: '13px',
    fontWeight: '700',
    cursor: 'pointer',
  },
  cancelBtn: {
    minHeight: '40px',
    padding: '0 14px',
    backgroundColor: 'transparent',
    border: '1px solid var(--border)',
    color: 'var(--text)',
    borderRadius: '6px',
    fontSize: '13px',
    fontWeight: '600',
    cursor: 'pointer',
  },
  editAmberWarningBox: {
    backgroundColor: 'var(--amber-light)',
    border: '1px solid var(--amber)',
    borderRadius: '6px',
    padding: '10px',
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
  },
  editErrorText: {
    color: 'var(--error)',
    fontSize: '13px',
    margin: 0,
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