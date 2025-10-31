import { render, h } from 'preact';
import { useState, useEffect, useMemo, useCallback, useRef } from 'preact/hooks';
import htm from 'https://unpkg.com/htm?module';
import { initializeApp } from 'firebase/app';
import { 
  getFirestore, 
  doc, 
  onSnapshot,
  setDoc,
  collection,
  updateDoc,
  arrayUnion,
  arrayRemove,
  getDocs,
  writeBatch,
} from 'firebase/firestore';

const html = htm.bind(h);

// --- TYPE DEFINITIONS ---
interface ProductStat {
  total_for_day: number;
  delivered: number;
  confirmed: number;
  cancelled_company: number;
  no_answer: number;
}

interface DailyData {
  products: { [productName: string]: ProductStat };
}

interface AllStats {
  [date: string]: DailyData;
}

interface CumulativeStats {
    totalOrders: number;
    totalDelivered: number;
    totalConfirmed: number;
    totalCancelled: number;
    totalNoAnswer: number;
}

type ToastType = 'success' | 'error' | 'warning' | 'info';
type Page = 'entry' | 'stats';

interface StatisticsPageProps {
    allStats: AllStats;
    onResetStats: () => Promise<void>;
    showToast: (message: string, type?: ToastType) => void;
}

// --- UTILITY FUNCTIONS ---
const getTodayDateString = () => new Date().toISOString().split('T')[0];

const getYesterdayDateString = (dateStr: string) => {
    const date = new Date(dateStr);
    date.setDate(date.getDate() - 1);
    return date.toISOString().split('T')[0];
};

const formatNumber = (num: number) => new Intl.NumberFormat('en-US').format(num);

const formatPercent = (value: number) => {
    if (isNaN(value) || !isFinite(value)) {
        return '0.0%';
    }
    return new Intl.NumberFormat('en-US', {
        style: 'percent',
        minimumFractionDigits: 1,
        maximumFractionDigits: 1,
    }).format(value);
};

// --- FIREBASE CONFIG ---
const firebaseConfig = {
  apiKey: "AIzaSyD2ddRXrr2phXa54q37nq28F5xFDC7pa6E",
  authDomain: "orders-tracker-8265e.firebaseapp.com",
  projectId: "orders-tracker-8265e",
  storageBucket: "orders-tracker-8265e.firebasestorage.app",
  messagingSenderId: "901944393997",
  appId: "1:901944393997:web:b0e5fc7941710fe9c6b044"
};
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// --- COMPONENTS ---

const Toast = ({ message, type }) => {
    return html`<div class=${`toast ${type}`}>${message}</div>`;
};

const ProductManagerModal = ({ products, onAddProduct, onDeleteProduct, onClose, showToast }) => {
  const [newProduct, setNewProduct] = useState('');

  const handleAdd = async () => {
    if (newProduct && !products.includes(newProduct)) {
      await onAddProduct(newProduct);
      showToast(`تمت إضافة "${newProduct}"`, 'success');
      setNewProduct('');
    } else {
      showToast('اسم المنتج موجود بالفعل أو فارغ.', 'warning');
    }
  };

  const handleDelete = async (product) => {
    if (confirm(`هل أنت متأكد من حذف "${product}"؟`)) {
       await onDeleteProduct(product);
       showToast(`تم حذف "${product}"`, 'info');
    }
  };

  return html`
    <div class="modal-backdrop" onClick=${onClose}>
      <div class="modal-content" onClick=${e => e.stopPropagation()}>
        <div class="modal-header">
            <h2>إدارة المنتجات</h2>
            <button class="modal-close" onClick=${onClose}>&times;</button>
        </div>
        <div style=${{display: 'flex', gap: '1rem', marginBottom: '1rem'}}>
          <input type="text" value=${newProduct} onChange=${(e) => setNewProduct(e.target.value)} placeholder="اسم المنتج الجديد" style=${{marginBottom: 0}} />
          <button class="primary" onClick=${handleAdd}>إضافة</button>
        </div>
        <ul style=${{listStyle: 'none', padding: 0}}>
          ${products.map(p => html`
            <li key=${p} style=${{display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.5rem 0', borderBottom: '1px solid var(--border-color)'}}>
              <span>${p}</span>
              <button class="danger" onClick=${() => handleDelete(p)}>حذف</button>
            </li>
          `)}
        </ul>
      </div>
    </div>
  `;
};

const StatsForm = ({ stats, onSave, date, setDate }) => {
    const [formState, setFormState] = useState<ProductStat>(stats);

    useEffect(() => {
        setFormState(stats);
    }, [stats]);
    
    const handleChange = (field: keyof ProductStat, value: string) => {
        setFormState(prev => ({ ...prev, [field]: Number(value) || 0 }));
    };

    const handleSubmit = (e: Event) => {
        e.preventDefault();
        onSave(formState);
    };

    return html`
        <form class="card stats-form" onSubmit=${handleSubmit}>
            <h2>
                إحصاءات اليوم
                <input type="date" value=${date} onChange=${(e: any) => setDate(e.target.value)} />
            </h2>
            <label>إجمالي طلبيات اليوم</label>
            <input type="number" min="0" value=${formState.total_for_day} onInput=${(e: any) => handleChange('total_for_day', e.target.value)} />
            
            <label>تم توصيلها (ليفري)</label>
            <input type="number" min="0" value=${formState.delivered} onInput=${(e: any) => handleChange('delivered', e.target.value)} />

            <label>مؤكدة</label>
            <input type="number" min="0" value=${formState.confirmed} onInput=${(e: any) => handleChange('confirmed', e.target.value)} />
            
            <label>ملغاة (شركة التوصيل)</label>
            <input type="number" min="0" value=${formState.cancelled_company} onInput=${(e: any) => handleChange('cancelled_company', e.target.value)} />
            
            <label>لم يرد</label>
            <input type="number" min="0" value=${formState.no_answer} onInput=${(e: any) => handleChange('no_answer', e.target.value)} />

            <button type="submit" class="primary" style=${{width: '100%', marginTop: '1rem', padding: '0.8rem'}}>حفظ</button>
        </form>
    `;
};

const Navigation = ({ page, setPage }) => {
    return html`
        <nav>
            <button class=${page === 'entry' ? 'active' : ''} onClick=${() => setPage('entry')}>إدخال البيانات</button>
            <button class=${page === 'stats' ? 'active' : ''} onClick=${() => setPage('stats')}>الإحصائيات</button>
        </nav>
    `;
};

const DataEntryPage = ({ products, selectedProduct, setSelectedProduct, setShowProductModal, todaysStat, handleSaveStats, currentDate, setCurrentDate, yesterdaysNoAnswer }) => {
    return html`
        <div class="card product-selector">
            <select onChange=${(e) => setSelectedProduct(e.target.value)} value=${selectedProduct || ''}>
                ${products.length > 0 
                    ? products.map(p => html`<option key=${p} value=${p}>${p}</option>`) 
                    : html`<option disabled value="">أضف منتجاً لتبدأ</option>`
                }
            </select>
            <button class="primary" onClick=${() => setShowProductModal(true)}>إدارة المنتجات</button>
        </div>
        
        ${selectedProduct ? html`
            <div class="main-grid">
                <${StatsForm} 
                    key=${`${selectedProduct}-${currentDate}`} 
                    stats=${todaysStat} 
                    onSave=${handleSaveStats} 
                    date=${currentDate} 
                    setDate=${setCurrentDate}
                />
                <div class="summaries">
                    <div class="card">
                        <h2 style=${{marginBottom: '1rem'}}>ملخص اليوم (${currentDate})</h2>
                        <div class="summary-item"><span>طلبيات اليوم:</span> <strong>${formatNumber(todaysStat.total_for_day)}</strong></div>
                        <div class="summary-item"><span>تم توصيلها:</span> <strong>${formatNumber(todaysStat.delivered)}</strong></div>
                        <div class="summary-item"><span>مؤكدة:</span> <strong>${formatNumber(todaysStat.confirmed)}</strong></div>
                        <div class="summary-item"><span>ملغاة:</span> <strong>${formatNumber(todaysStat.cancelled_company)}</strong></div>
                        <div class="summary-item"><span>لم يرد (اليوم):</span> <strong>${formatNumber(todaysStat.no_answer)}</strong></div>
                        <div class="summary-item"><span>لم يرد (الأمس):</span> <strong>${formatNumber(yesterdaysNoAnswer)}</strong></div>
                    </div>
                </div>
            </div>
        ` : html`
            <div class="card" style=${{textAlign: 'center'}}><p>الرجاء اختيار منتج أو إضافة منتج جديد للبدء.</p></div>
        `}
    `;
};

const StatisticsPage = ({ allStats, onResetStats }: StatisticsPageProps) => {
    const [filter, setFilter] = useState('all');
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');

    const allHistoricalProducts = useMemo(() => {
        const productSet = new Set<string>();
        Object.values(allStats).forEach(daily => {
            Object.keys(daily.products || {}).forEach(p => productSet.add(p));
        });
        return Array.from(productSet).sort();
    }, [allStats]);
    
    const cumulativeStats = useMemo<CumulativeStats>(() => {
        const initialStats = { totalOrders: 0, totalDelivered: 0, totalConfirmed: 0, totalCancelled: 0, totalNoAnswer: 0 };
        return Object.entries(allStats)
            .filter(([date]) => {
                if (startDate && date < startDate) return false;
                if (endDate && date > endDate) return false;
                return true;
            })
            .reduce((acc: CumulativeStats, [, dailyData]: [string, DailyData]) => {
                const productEntries = Object.entries(dailyData.products || {});
                for (const [productName, productStat] of productEntries) {
                    if (filter === 'all' || filter === productName) {
                        if (productStat) {
                            acc.totalOrders += productStat.total_for_day;
                            acc.totalDelivered += productStat.delivered;
                            acc.totalConfirmed += productStat.confirmed;
                            acc.totalCancelled += productStat.cancelled_company;
                            acc.totalNoAnswer += productStat.no_answer;
                        }
                    }
                }
                return acc;
        }, initialStats);
    }, [allStats, filter, startDate, endDate]);

    const {
        totalOrders,
        totalDelivered,
        totalConfirmed,
        totalCancelled,
        totalNoAnswer
    } = cumulativeStats;

    const successRate = totalOrders > 0 ? totalDelivered / totalOrders : 0;
    const confirmationRate = totalOrders > 0 ? totalConfirmed / totalOrders : 0;
    const deliveryAfterConfirmationRate = totalConfirmed > 0 ? totalDelivered / totalConfirmed : 0;
    const noAnswerRate = totalOrders > 0 ? totalNoAnswer / totalOrders : 0;
    const cancellationRate = totalOrders > 0 ? totalCancelled / totalOrders : 0;


    const handleReset = async () => {
        if (confirm("هل أنت متأكد من حذف جميع الإحصائيات؟ لا يمكن التراجع عن هذا الإجراء.")) {
            await onResetStats();
        }
    };
    
    const StatCard = ({ label, value, valueClass = '' }) => html`
        <div class="stat-card">
            <span class="label">${label}</span>
            <span class="value ${valueClass}">${value}</span>
        </div>
    `;
    
    return html`
        <div class="card">
            <h2 style=${{marginBottom: '1rem'}}>فلترة الإحصائيات</h2>
            <div class="filter-container">
                <div class="filter-controls">
                    <label for="product-filter">عرض إحصائيات لـ:</label>
                    <select id="product-filter" value=${filter} onChange=${e => setFilter(e.target.value)}>
                        <option value="all">كل المنتجات</option>
                        ${allHistoricalProducts.map(p => html`<option value=${p}>${p}</option>`)}
                    </select>
                </div>
                 <div class="filter-controls">
                    <label for="start-date">من تاريخ:</label>
                    <input type="date" id="start-date" value=${startDate} onChange=${e => setStartDate(e.target.value)} />
                </div>
                <div class="filter-controls">
                    <label for="end-date">إلى تاريخ:</label>
                    <input type="date" id="end-date" value=${endDate} onChange=${e => setEndDate(e.target.value)} />
                </div>
            </div>
        </div>
        <div class="card stats-grid-container">
             <h2 style=${{marginBottom: '1.5rem'}}>
                الإحصائيات المجمعة: ${filter === 'all' ? 'كل المنتجات' : filter}
             </h2>
             <div class="stats-grid">
                <${StatCard} label="إجمالي الطلبيات" value=${formatNumber(totalOrders)} />
                <${StatCard} label="تم توصيلها" value=${formatNumber(totalDelivered)} />
                <${StatCard} label="مؤكدة" value=${formatNumber(totalConfirmed)} />
                <${StatCard} label="ملغاة" value=${formatNumber(totalCancelled)} />
                <${StatCard} label="لم يرد" value=${formatNumber(totalNoAnswer)} />
                
                <${StatCard} label="نسبة النجاح" value=${formatPercent(successRate)} valueClass="percent" />
                <${StatCard} label="نسبة التأكيد" value=${formatPercent(confirmationRate)} valueClass="percent" />
                <${StatCard} label="نسبة التوصيل" value=${formatPercent(deliveryAfterConfirmationRate)} valueClass="percent" />
                <${StatCard} label="نسبة لم يرد" value=${formatPercent(noAnswerRate)} valueClass="danger" />
                <${StatCard} label="نسبة الإلغاء" value=${formatPercent(cancellationRate)} valueClass="danger" />
             </div>
        </div>
        <div class="danger-zone">
            <h3>منطقة الخطر</h3>
            <p>سيؤدي هذا الإجراء إلى حذف جميع بيانات الإحصائيات اليومية بشكل دائم. لن يتم حذف قائمة منتجاتك.</p>
            <button class="danger" onClick=${handleReset}>تصفير جميع الإحصائيات</button>
        </div>
    `;
};


const App = () => {
    const [products, setProducts] = useState<string[]>([]);
    const [selectedProduct, setSelectedProduct] = useState<string | null>(null);
    const [allStats, setAllStats] = useState<AllStats>({});
    const [currentDate, setCurrentDate] = useState(getTodayDateString());
    const [isLoading, setIsLoading] = useState(true);
    const [showProductModal, setShowProductModal] = useState(false);
    const [page, setPage] = useState<Page>('entry');
    
    const [toasts, setToasts] = useState<any[]>([]);
    const toastIdCounter = useRef(0);

    const showToast = useCallback((message: string, type: ToastType = 'info') => {
        const id = toastIdCounter.current++;
        setToasts(currentToasts => [...currentToasts, { id, message, type }]);
        setTimeout(() => {
            setToasts(currentToasts => currentToasts.filter(t => t.id !== id));
        }, 3000);
    }, []);

    useEffect(() => {
        const unsubProducts = onSnapshot(doc(db, "app-data", "products"), (docSnap) => {
            if (docSnap.exists()) {
                const productList = docSnap.data().list || [];
                setProducts(productList);
                // This logic ensures a product is always selected if available,
                // and handles the case where the selected product is deleted.
                setSelectedProduct(currentSelected => {
                    if (productList.length === 0) return null;
                    if (currentSelected && productList.includes(currentSelected)) {
                        return currentSelected; // Selection is still valid
                    }
                    return productList[0]; // Otherwise, select the first product
                });
            } else {
                setDoc(doc(db, "app-data", "products"), { list: [] });
            }
        });

        const unsubStats = onSnapshot(collection(db, "daily-stats-v2"), (snapshot) => {
            const statsData: AllStats = {};
            snapshot.forEach((docSnap) => {
                statsData[docSnap.id] = docSnap.data() as DailyData;
            });
            setAllStats(statsData);
            setIsLoading(false);
        });

        return () => {
            unsubProducts();
            unsubStats();
        };
    }, []);

    const todaysStat = useMemo<ProductStat>(() => {
        return allStats[currentDate]?.products?.[selectedProduct] || {
            total_for_day: 0, delivered: 0, confirmed: 0, cancelled_company: 0, no_answer: 0,
        };
    }, [allStats, currentDate, selectedProduct]);

    const yesterdaysNoAnswer = useMemo<number>(() => {
        const yesterday = getYesterdayDateString(currentDate);
        return allStats[yesterday]?.products?.[selectedProduct]?.no_answer || 0;
    }, [allStats, currentDate, selectedProduct]);
        
    const handleSaveStats = async (newStats: ProductStat) => {
        if (!selectedProduct) {
            showToast("الرجاء اختيار منتج أولاً.", 'warning');
            return;
        }
        try {
            const docRef = doc(db, "daily-stats-v2", currentDate);
            await setDoc(docRef, {
                products: {
                    ...allStats[currentDate]?.products,
                    [selectedProduct]: newStats
                }
            }, { merge: true });
            showToast("تم حفظ الإحصاءات بنجاح!", 'success');
        } catch (error) {
            console.error("Error saving stats:", error);
            showToast("فشل حفظ البيانات.", 'error');
        }
    };

    const handleResetAllStats = async () => {
        try {
            const statsCollection = collection(db, "daily-stats-v2");
            const snapshot = await getDocs(statsCollection);
            const batch = writeBatch(db);
            snapshot.forEach(doc => {
                batch.delete(doc.ref);
            });
            await batch.commit();
            showToast("تم حذف جميع الإحصائيات بنجاح!", 'success');
        } catch (error) {
            console.error("Error resetting stats:", error);
            showToast("حدث خطأ أثناء تصفير الإحصائيات.", 'error');
        }
    };

    const handleAddProduct = (productName: string) => updateDoc(doc(db, "app-data", "products"), { list: arrayUnion(productName) });
    
    const handleDeleteProduct = async (productName: string) => {
        if (selectedProduct === productName) {
            const otherProducts = products.filter(p => p !== productName);
            setSelectedProduct(otherProducts.length > 0 ? otherProducts[0] : null);
        }
        await updateDoc(doc(db, "app-data", "products"), { list: arrayRemove(productName) });
    };

    if (isLoading) {
        return html`<div class="loading-overlay"><div class="spinner"></div></div>`;
    }

    return html`
        <div class="container">
            <h1>متتبع الطلبيات</h1>

            <${Navigation} page=${page} setPage=${setPage} />

            ${page === 'entry' && html`
                <${DataEntryPage} 
                    products=${products}
                    selectedProduct=${selectedProduct}
                    setSelectedProduct=${setSelectedProduct}
                    setShowProductModal=${setShowProductModal}
                    todaysStat=${todaysStat}
                    handleSaveStats=${handleSaveStats}
                    currentDate=${currentDate}
                    setCurrentDate=${setCurrentDate}
                    yesterdaysNoAnswer=${yesterdaysNoAnswer}
                />
            `}
            
            ${page === 'stats' && html`
                <${StatisticsPage} 
                    allStats=${allStats} 
                    onResetStats=${handleResetAllStats}
                    showToast=${showToast}
                />
            `}

            ${showProductModal && html`
                <${ProductManagerModal} 
                    products=${products} 
                    onAddProduct=${handleAddProduct} 
                    onDeleteProduct=${handleDeleteProduct}
                    onClose=${() => setShowProductModal(false)}
                    showToast=${showToast}
                />
            `}

            <div class="toast-container">
                ${toasts.map(toast => html`
                    <${Toast} key=${toast.id} message=${toast.message} type=${toast.type} />
                `)}
            </div>
        </div>
    `;
};

render(html`<${App} />`, document.getElementById('app'));