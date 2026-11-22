
import { useEffect, useMemo, useState } from 'react'
import './App.css'

const API = {
  user: 'http://localhost:8005',
  order: 'http://localhost:8002',
  payment: 'http://localhost:8004',
  search: 'http://localhost:8003'
}

const productDetails = {
  1: {
    category: 'Computers',
    image: 'https://images.unsplash.com/photo-1496181133206-80ce9b88a853?w=900',
    badge: 'BEST SELLER',
    number: '01'
  },
  2: {
    category: 'Phones',
    image: 'https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?w=900',
    badge: 'TRENDING',
    number: '02'
  },
  3: {
    category: 'Accessories',
    image: 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=900',
    badge: 'POPULAR',
    number: '03'
  }
}

function App() {
  const [products, setProducts] = useState([])
  const [cart, setCart] = useState([])
  const [loading, setLoading] = useState(true)

  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('All')

  const [token, setToken] = useState(
    () => localStorage.getItem('nova_token') || ''
  )
  const [currentUser, setCurrentUser] = useState(null)
  const [authChecking, setAuthChecking] = useState(true)
  const [authMode, setAuthMode] = useState('login')
  const [authOpen, setAuthOpen] = useState(false)
  const [authLoading, setAuthLoading] = useState(false)
  const [authMessage, setAuthMessage] = useState('')
  const [authSuccess, setAuthSuccess] = useState(false)

  const [authForm, setAuthForm] = useState({
    name: '',
    email: '',
    password: ''
  })

  const [checkoutLoading, setCheckoutLoading] = useState(false)
  const [checkoutMessage, setCheckoutMessage] = useState('')
  const [checkoutSuccess, setCheckoutSuccess] = useState(false)
  const [pendingOrderId, setPendingOrderId] = useState(null)

  // Restore the saved login session.
  useEffect(() => {
    if (!token) {
      setAuthChecking(false)
      return
    }

    fetch(`${API.user}/auth/me`, {
      headers: {
        Authorization: `Bearer ${token}`
      }
    })
      .then(async response => {
        if (!response.ok) {
          throw new Error('Session expired')
        }

        return response.json()
      })
      .then(user => {
        setCurrentUser(user)
      })
      .catch(() => {
        localStorage.removeItem('nova_token')
        setToken('')
        setCurrentUser(null)
      })
      .finally(() => {
        setAuthChecking(false)
      })
  }, [])

  // Load products.
  useEffect(() => {
    const controller = new AbortController()

    setLoading(true)

    fetch(
      `${API.search}/search?q=${encodeURIComponent(search)}`,
      { signal: controller.signal }
    )
      .then(response => {
        if (!response.ok) {
          throw new Error('Failed to load products')
        }

        return response.json()
      })
      .then(data => setProducts(data))
      .catch(error => {
        if (error.name !== 'AbortError') {
          console.error(error)
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setLoading(false)
        }
      })

    return () => controller.abort()
  }, [search])

  const categories = [
    'All',
    'Computers',
    'Phones',
    'Accessories'
  ]

  const filteredProducts = useMemo(() => {
    return products.filter(product => {
      const details = productDetails[product.id] || {}

      return (
        category === 'All' ||
        details.category === category
      )
    })
  }, [products, category])

  const totalItems = cart.reduce(
    (sum, item) => sum + item.quantity,
    0
  )

  const totalPrice = cart.reduce(
    (sum, item) => sum + item.price * item.quantity,
    0
  )

  const clearCheckoutMessage = () => {
    setCheckoutMessage('')
    setCheckoutSuccess(false)
  }

  const addToCart = product => {
    clearCheckoutMessage()
    setPendingOrderId(null)

    setCart(current => {
      const existing = current.find(
        item => item.id === product.id
      )

      if (existing) {
        return current.map(item =>
          item.id === product.id
            ? {
                ...item,
                quantity: item.quantity + 1
              }
            : item
        )
      }

      return [
        ...current,
        {
          ...product,
          quantity: 1
        }
      ]
    })
  }

  const changeQuantity = (id, amount) => {
    clearCheckoutMessage()
    setPendingOrderId(null)

    setCart(current =>
      current
        .map(item =>
          item.id === id
            ? {
                ...item,
                quantity: item.quantity + amount
              }
            : item
        )
        .filter(item => item.quantity > 0)
    )
  }

  const updateAuthField = event => {
    const { name, value } = event.target

    setAuthForm(current => ({
      ...current,
      [name]: value
    }))
  }

  const handleAuth = async event => {
    event.preventDefault()

    if (authLoading) return

    setAuthLoading(true)
    setAuthMessage('')
    setAuthSuccess(false)

    const endpoint =
      authMode === 'register'
        ? '/auth/register'
        : '/auth/login'

    const body =
      authMode === 'register'
        ? {
            name: authForm.name.trim(),
            email: authForm.email.trim(),
            password: authForm.password
          }
        : {
            email: authForm.email.trim(),
            password: authForm.password
          }

    try {
      const response = await fetch(
        `${API.user}${endpoint}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(body)
        }
      )

      const data = await response.json()

      if (!response.ok) {
        throw new Error(
          data.detail || 'Authentication failed'
        )
      }

      localStorage.setItem(
        'nova_token',
        data.access_token
      )

      setToken(data.access_token)
      setCurrentUser(data.user)
      setAuthOpen(false)

      setAuthForm({
        name: '',
        email: '',
        password: ''
      })

      setAuthMessage('')
      setAuthSuccess(true)
      setPendingOrderId(null)
      clearCheckoutMessage()
    } catch (error) {
      setAuthMessage(
        error.message || 'Something went wrong'
      )
      setAuthSuccess(false)
    } finally {
      setAuthLoading(false)
    }
  }

  const handleLogout = () => {
    localStorage.removeItem('nova_token')

    setToken('')
    setCurrentUser(null)
    setPendingOrderId(null)
    setAuthOpen(false)
    setAuthMode('login')

    setAuthForm({
      name: '',
      email: '',
      password: ''
    })

    setAuthMessage('')
    clearCheckoutMessage()
  }

  const openAuth = mode => {
    setAuthMode(mode)
    setAuthMessage('')
    setAuthSuccess(false)
    setAuthOpen(true)
  }

  const handleCheckout = async () => {
    if (cart.length === 0 || checkoutLoading) return

    if (!token || !currentUser) {
      openAuth('login')
      setAuthMessage('Please sign in to continue checkout.')
      return
    }

    setCheckoutLoading(true)
    clearCheckoutMessage()

    try {
      let orderId = pendingOrderId

      if (!orderId) {
        const orderResponse = await fetch(
          `${API.order}/orders`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`
            },
            body: JSON.stringify({
              items: cart.map(item => ({
                product_id: item.id,
                name: item.name,
                price: item.price,
                quantity: item.quantity
              })),
              total: totalPrice
            })
          }
        )

        const orderData = await orderResponse.json()

        if (!orderResponse.ok) {
          throw new Error(
            orderData.detail || 'Could not create order'
          )
        }

        orderId = orderData.order.id
        setPendingOrderId(orderId)
      }

      const paymentResponse = await fetch(
        `${API.payment}/payments`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`
          },
          body: JSON.stringify({
            order_id: orderId,
            amount: totalPrice
          })
        }
      )

      const paymentData = await paymentResponse.json()

      if (!paymentResponse.ok) {
        if (paymentResponse.status === 401) {
          handleLogout()
          throw new Error(
            'Your session expired. Please sign in again.'
          )
        }

        throw new Error(
          `Order #${orderId} created, but payment failed: ${
            paymentData.detail || 'Payment error'
          }`
        )
      }

      setCheckoutMessage(
        `Order #${orderId} paid successfully! Payment #${paymentData.payment.id}`
      )

      setCheckoutSuccess(true)
      setCart([])
      setPendingOrderId(null)
    } catch (error) {
      setCheckoutMessage(
        error.message || 'Something went wrong'
      )
    } finally {
      setCheckoutLoading(false)
    }
  }

  return (
    <div className="store">
      <div className="announcement">
        <span>THE NEXT GENERATION OF TECH IS HERE</span>
        <span className="announcement-right">
          DISCOVER WHAT'S NEXT ↗
        </span>
      </div>

      <header className="navbar">
        <a className="logo" href="#home">
          NOVA<span>®</span>
        </a>

        <nav>
          <a href="#home">Home</a>
          <a href="#products">Shop</a>
          <a href="#categories">Collections</a>
        </nav>

        <div className="navbar-actions">
          {authChecking ? (
            <span className="auth-loading">
              LOADING...
            </span>
          ) : currentUser ? (
            <div className="user-menu">
              <div className="user-avatar">
                {currentUser.name?.charAt(0).toUpperCase()}
              </div>

              <div className="user-details">
                <strong>{currentUser.name}</strong>
                <span>MEMBER</span>
              </div>

              <button
                className="logout-button"
                onClick={handleLogout}
              >
                LOG OUT ↗
              </button>
            </div>
          ) : (
            <button
              className="nav-auth-button"
              onClick={() => openAuth('login')}
            >
              SIGN IN ↗
            </button>
          )}

          <a href="#cart" className="cart-link">
            <span>YOUR BAG</span>
            <span className="cart-count">
              {totalItems}
            </span>
            <span className="cart-arrow">↗</span>
          </a>
        </div>
      </header>

      {authOpen && !currentUser && (
        <section className="auth-section">
          <div className="auth-card">
            <div className="auth-card-visual">
              <span className="auth-visual-label">
                NOVA MEMBERSHIP / 2026
              </span>

              <div className="auth-visual-content">
                <span className="auth-visual-symbol">N.</span>
                <h2>
                  YOUR WORLD.
                  <br />
                  <span>YOUR NOVA.</span>
                </h2>
                <p>
                  A smarter way to discover,
                  shop and experience technology.
                </p>
              </div>

              <span className="auth-visual-footer">
                TECHNOLOGY FOR WHAT'S NEXT.
              </span>
            </div>

            <div className="auth-card-form">
              <button
                className="auth-close"
                onClick={() => {
                  setAuthOpen(false)
                  setAuthMessage('')
                }}
                aria-label="Close authentication"
              >
                ×
              </button>

              <span className="eyebrow">
                {authMode === 'login'
                  ? 'WELCOME BACK'
                  : 'JOIN THE NOVA COMMUNITY'}
              </span>

              <h2>
                {authMode === 'login'
                  ? 'SIGN IN.'
                  : 'CREATE ACCOUNT.'}
              </h2>

              <p className="auth-description">
                {authMode === 'login'
                  ? 'Enter your details to access your account.'
                  : 'Create your account and discover a new way to shop.'}
              </p>

              <form onSubmit={handleAuth}>
                {authMode === 'register' && (
                  <label className="auth-field">
                    <span>FULL NAME</span>
                    <input
                      type="text"
                      name="name"
                      placeholder="Your name"
                      value={authForm.name}
                      onChange={updateAuthField}
                      minLength={1}
                      maxLength={100}
                      autoComplete="name"
                      required
                    />
                  </label>
                )}

                <label className="auth-field">
                  <span>EMAIL ADDRESS</span>
                  <input
                    type="email"
                    name="email"
                    placeholder="you@example.com"
                    value={authForm.email}
                    onChange={updateAuthField}
                    autoComplete="email"
                    required
                  />
                </label>

                <label className="auth-field">
                  <span>PASSWORD</span>
                  <input
                    type="password"
                    name="password"
                    placeholder="At least 8 characters"
                    value={authForm.password}
                    onChange={updateAuthField}
                    minLength={authMode === 'register' ? 8 : 1}
                    maxLength={128}
                    autoComplete={
                      authMode === 'register'
                        ? 'new-password'
                        : 'current-password'
                    }
                    required
                  />
                </label>

                {authMessage && (
                  <div className="auth-error">
                    {authMessage}
                  </div>
                )}

                <button
                  type="submit"
                  className="auth-submit"
                  disabled={authLoading}
                >
                  {authLoading
                    ? 'PLEASE WAIT...'
                    : authMode === 'login'
                      ? 'SIGN IN TO NOVA ↗'
                      : 'CREATE MY ACCOUNT ↗'}
                </button>
              </form>

              <div className="auth-switch">
                <span>
                  {authMode === 'login'
                    ? "DON'T HAVE AN ACCOUNT?"
                    : 'ALREADY A MEMBER?'}
                </span>

                <button
                  onClick={() => {
                    setAuthMode(
                      authMode === 'login'
                        ? 'register'
                        : 'login'
                    )
                    setAuthMessage('')
                    setAuthForm({
                      name: '',
                      email: authForm.email,
                      password: ''
                    })
                  }}
                >
                  {authMode === 'login'
                    ? 'CREATE ACCOUNT'
                    : 'SIGN IN'}
                </button>
              </div>

              <div className="auth-secure">
                <span>✓</span>
                YOUR ACCOUNT IS PROTECTED
              </div>
            </div>
          </div>
        </section>
      )}

      <main>
        <section className="hero" id="home">
          <div className="hero-topline">
            <span>INNOVATION, REDEFINED.</span>
            <span>EST. 2026 — NOVA STORE</span>
          </div>

          <div className="hero-content">
            <span className="hero-label">
              TECH THAT MOVES YOU.
            </span>

            <h1>
              OWN THE
              <br />
              <span>FUTURE.</span>
            </h1>

            <div className="hero-bottom">
              <p>
                Discover the technology that keeps you ahead.
                Curated essentials. Exceptional experiences.
              </p>

              <a href="#products" className="hero-button">
                EXPLORE COLLECTION <span>↗</span>
              </a>
            </div>
          </div>

          <div className="hero-visual">
            <img
              src="https://images.unsplash.com/photo-1498049794561-7780e7231661?w=1400"
              alt="Modern technology collection"
            />

            <div className="hero-sticker">
              <span>NEW</span>
              <strong>ERA</strong>
              <span>OF TECH</span>
            </div>

            <span className="visual-caption">
              DESIGNED FOR WHAT'S NEXT.
            </span>
          </div>

          <div className="hero-index">
            <span>01</span>
            <span className="index-line" />
            <span>03</span>
          </div>
        </section>

        <section className="features">
          <div className="feature-item">
            <span className="feature-number">01 /</span>
            <div>
              <strong>FAST DELIVERY</strong>
              <small>Right to your doorstep.</small>
            </div>
          </div>

          <div className="feature-item">
            <span className="feature-number">02 /</span>
            <div>
              <strong>SECURE SHOPPING</strong>
              <small>Shop with confidence.</small>
            </div>
          </div>

          <div className="feature-item">
            <span className="feature-number">03 /</span>
            <div>
              <strong>QUALITY FIRST</strong>
              <small>Only the essentials.</small>
            </div>
          </div>
        </section>

        <section className="catalog" id="products">
          <div className="section-heading">
            <div>
              <span className="eyebrow">
                01 — THE COLLECTION
              </span>

              <h2>
                GOOD TECH.
                <br />
                <span>GREAT TASTE.</span>
              </h2>
            </div>

            <p className="section-description">
              Thoughtfully selected technology
              <br />
              for people who think differently.
            </p>
          </div>

          <div className="catalog-toolbar" id="categories">
            <div className="categories">
              {categories.map(item => (
                <button
                  key={item}
                  className={
                    category === item
                      ? 'category active'
                      : 'category'
                  }
                  onClick={() => setCategory(item)}
                >
                  {item}
                </button>
              ))}
            </div>

            <label className="search-box">
              <span>⌕</span>
              <input
                type="text"
                placeholder="Search the collection..."
                value={search}
                onChange={event =>
                  setSearch(event.target.value)
                }
              />
              <span className="search-shortcut">↵</span>
            </label>
          </div>

          {loading ? (
            <p className="status">
              LOADING THE COLLECTION...
            </p>
          ) : filteredProducts.length === 0 ? (
            <p className="status">
              NO PRODUCTS FOUND. TRY ANOTHER SEARCH.
            </p>
          ) : (
            <div className="product-grid">
              {filteredProducts.map((product, index) => {
                const details =
                  productDetails[product.id] || {}

                return (
                  <article
                    className="product-card"
                    key={product.id}
                  >
                    <div className="product-image">
                      <img
                        src={
                          details.image ||
                          'https://images.unsplash.com/photo-1498049794561-7780e7231661?w=900'
                        }
                        alt={product.name}
                      />

                      <span className="product-badge">
                        {details.badge || 'NOVA PICK'}
                      </span>

                      <span className="product-index">
                        {details.number ||
                          String(index + 1).padStart(2, '0')}
                      </span>

                      <button
                        className="quick-add"
                        onClick={() => addToCart(product)}
                        aria-label={`Add ${product.name} to cart`}
                      >
                        +
                      </button>
                    </div>

                    <div className="product-info">
                      <div className="product-meta">
                        <span>
                          {details.category || 'TECHNOLOGY'}
                        </span>
                        <span>AVAILABLE NOW</span>
                      </div>

                      <div className="product-bottom">
                        <h3>{product.name}</h3>
                        <strong>${product.price}</strong>
                      </div>

                      <button
                        className="add-button"
                        onClick={() => addToCart(product)}
                      >
                        ADD TO BAG <span>↗</span>
                      </button>
                    </div>
                  </article>
                )
              })}
            </div>
          )}
        </section>

        <section className="statement">
          <span className="eyebrow">
            THE NOVA POINT OF VIEW
          </span>

          <h2>
            LESS NOISE.
            <br />
            <span>MORE INNOVATION.</span>
          </h2>

          <p>
            We believe great technology should do more than work.
            It should inspire the way you live, create and connect.
          </p>

          <a href="#products">
            FIND YOUR NEXT FAVORITE ↗
          </a>

          <span className="statement-mark">N.</span>
        </section>

        <section className="cart-section" id="cart">
          <div className="section-heading cart-heading">
            <div>
              <span className="eyebrow">
                02 — YOUR SELECTION
              </span>

              <h2>
                YOUR BAG<span>.</span>
              </h2>
            </div>

            <p className="section-description">
              {totalItems} {totalItems === 1 ? 'ITEM' : 'ITEMS'} SELECTED
            </p>
          </div>

          {cart.length === 0 ? (
            <div className="empty-cart">
              <span className="empty-cart-icon">＋</span>
              <h3>NOTHING HERE. YET.</h3>
              <p>
                Your next favorite thing is waiting to be discovered.
              </p>
              <a href="#products">
                EXPLORE THE COLLECTION ↗
              </a>
            </div>
          ) : (
            <div className="cart-content">
              <div className="cart-items">
                {cart.map(item => {
                  const details =
                    productDetails[item.id] || {}

                  return (
                    <div
                      className="cart-item"
                      key={item.id}
                    >
                      <img
                        src={
                          details.image ||
                          'https://images.unsplash.com/photo-1498049794561-7780e7231661?w=400'
                        }
                        alt={item.name}
                      />

                      <div className="cart-item-info">
                        <span>
                          {details.category || 'TECHNOLOGY'}
                        </span>
                        <h3>{item.name}</h3>
                        <p>${item.price} / UNIT</p>
                      </div>

                      <div className="quantity">
                        <button
                          onClick={() =>
                            changeQuantity(item.id, -1)
                          }
                        >
                          −
                        </button>

                        <span>{item.quantity}</span>

                        <button
                          onClick={() =>
                            changeQuantity(item.id, 1)
                          }
                        >
                          +
                        </button>
                      </div>

                      <strong className="cart-item-total">
                        ${item.price * item.quantity}
                      </strong>
                    </div>
                  )
                })}
              </div>

              <div className="cart-summary">
                <span className="eyebrow">
                  ORDER DETAILS
                </span>

                <h3>THE SUMMARY.</h3>

                <div className="summary-customer">
                  {currentUser ? (
                    <>
                      <div className="user-avatar">
                        {currentUser.name
                          ?.charAt(0)
                          .toUpperCase()}
                      </div>

                      <div>
                        <span>CHECKING OUT AS</span>
                        <strong>{currentUser.name}</strong>
                      </div>

                      <span className="verified-mark">✓</span>
                    </>
                  ) : (
                    <>
                      <div className="guest-avatar">?</div>

                      <div>
                        <span>GUEST CHECKOUT</span>
                        <strong>Sign in to continue</strong>
                      </div>

                      <button
                        onClick={() => openAuth('login')}
                      >
                        SIGN IN ↗
                      </button>
                    </>
                  )}
                </div>

                <div className="summary-row">
                  <span>ITEMS</span>
                  <strong>{totalItems}</strong>
                </div>

                <div className="summary-row summary-total">
                  <span>TOTAL</span>
                  <strong>${totalPrice}</strong>
                </div>

                <button
                  className="checkout-button"
                  onClick={handleCheckout}
                  disabled={checkoutLoading}
                >
                  {checkoutLoading
                    ? 'PROCESSING...'
                    : pendingOrderId
                      ? 'RETRY PAYMENT ↗'
                      : 'CONTINUE TO CHECKOUT ↗'}
                </button>

                <p className="secure-note">
                  ✓ SECURE CHECKOUT EXPERIENCE
                </p>
              </div>
            </div>
          )}

          {checkoutMessage && (
            <div
              className={
                checkoutSuccess
                  ? 'checkout-message success'
                  : 'checkout-message error'
              }
            >
              <span>
                {checkoutSuccess ? '✓' : '!'}
              </span>
              {checkoutMessage}
            </div>
          )}
        </section>
      </main>

      <footer>
        <div className="footer-top">
          <a className="logo footer-logo" href="#home">
            NOVA<span>®</span>
          </a>

          <p>TECHNOLOGY FOR WHAT'S NEXT.</p>

          <a href="#home" className="back-top">
            BACK TO TOP ↑
          </a>
        </div>

        <div className="footer-bottom">
          <span>
            © 2026 NOVA STORE. ALL RIGHTS RESERVED.
          </span>
          <span>BUILT FOR THE NEXT GENERATION.</span>
        </div>
      </footer>
    </div>
  )
}

export default App

