'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Database, Server, User, CheckCircle, ChevronRight, AlertCircle, Loader2, Eye, EyeOff } from 'lucide-react';
import axios from 'axios';

export default function SetupPage() {
  const router = useRouter();
  const [currentStep, setCurrentStep] = useState<number>(0); // 0: loading, 1: DB, 2: Redis, 3: Admin, 4: Success
  const [isChecking, setIsChecking] = useState(true);
  const [globalError, setGlobalError] = useState('');
  
  // Password Visibility State
  const [showDbPassword, setShowDbPassword] = useState(false);
  const [showRedisPassword, setShowRedisPassword] = useState(false);
  const [showAdminPassword, setShowAdminPassword] = useState(false);
  
  // Forms State
  const [dbForm, setDbForm] = useState({
    host: '127.0.0.1',
    port: 5432,
    user: 'postgres',
    password: 'password',
    dbname: 'subiohub',
    sslmode: 'disable'
  });

  const [redisForm, setRedisForm] = useState({
    host: '127.0.0.1',
    port: 6379,
    password: '',
    db: 0,
    enable_tls: false
  });

  const [adminForm, setAdminForm] = useState({
    email: 'admin@admin.com',
    password: 'password123' // 必须大于等于8位
  });

  const [serverForm, setServerForm] = useState({
    port: 8080
  });

  // Validation/Testing State
  const [isTesting, setIsTesting] = useState(false);
  const [testSuccess, setTestSuccess] = useState('');
  const [testError, setTestError] = useState('');

  useEffect(() => {
    checkStatus();
  }, []);

  const checkStatus = async () => {
    try {
      const res = await axios.get('/setup/status');
      if (!res.data.data.needs_setup) {
        // System already installed
        router.push('/login');
      } else {
        setCurrentStep(1);
      }
    } catch (error: any) {
      if (error.response?.status === 403) {
        // Already installed
        router.push('/login');
      } else {
        setGlobalError('无法连接到后端服务，请确保后端服务已启动。');
      }
    } finally {
      setIsChecking(false);
    }
  };

  const handleTestDB = async () => {
    setIsTesting(true);
    setTestError('');
    setTestSuccess('');
    try {
      const res = await axios.post('/setup/test-db', dbForm);
      setTestSuccess('数据库连接成功！');
      setTimeout(() => {
        setCurrentStep(2);
        setTestSuccess('');
      }, 1000);
    } catch (error: any) {
      setTestError(error.response?.data?.message || '数据库连接失败');
    } finally {
      setIsTesting(false);
    }
  };

  const handleTestRedis = async () => {
    setIsTesting(true);
    setTestError('');
    setTestSuccess('');
    try {
      const res = await axios.post('/setup/test-redis', redisForm);
      setTestSuccess('Redis 连接成功！');
      setTimeout(() => {
        setCurrentStep(3);
        setTestSuccess('');
      }, 1000);
    } catch (error: any) {
      setTestError(error.response?.data?.message || 'Redis 连接失败');
    } finally {
      setIsTesting(false);
    }
  };

  const handleInstall = async () => {
    setIsTesting(true);
    setTestError('');
    try {
      const payload = {
        database: dbForm,
        redis: redisForm,
        admin: adminForm,
        server: serverForm
      };
      const res = await axios.post('/setup/install', payload);
      setCurrentStep(4);
    } catch (error: any) {
      setTestError(error.response?.data?.message || '安装失败，请检查填写信息');
    } finally {
      setIsTesting(false);
    }
  };

  if (isChecking) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
        <div className="text-center">
          <Loader2 className="h-10 w-10 animate-spin text-blue-600 mx-auto mb-4" />
          <p className="text-gray-500 dark:text-gray-400">正在检查系统状态...</p>
        </div>
      </div>
    );
  }

  if (globalError) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
        <div className="max-w-md w-full p-6 bg-white dark:bg-gray-800 rounded-lg shadow-xl text-center">
          <AlertCircle className="h-12 w-12 text-red-500 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-2">服务不可用</h2>
          <p className="text-gray-500 dark:text-gray-400 mb-6">{globalError}</p>
          <button
            onClick={checkStatus}
            className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
          >
            重试
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-3xl mx-auto">
        {/* Header */}
        <div className="text-center mb-10">
          <h1 className="text-3xl font-extrabold text-gray-900 dark:text-white">SubioHub 系统安装向导</h1>
          <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">完成以下配置以初始化您的应用环境</p>
        </div>

        {/* Steps Indicator */}
        <div className="mb-10">
          <div className="flex items-center justify-center space-x-4 sm:space-x-8">
            {[
              { id: 1, name: '数据库', icon: Database },
              { id: 2, name: 'Redis', icon: Server },
              { id: 3, name: '管理员', icon: User },
              { id: 4, name: '完成', icon: CheckCircle }
            ].map((step) => (
              <div key={step.id} className="flex flex-col items-center">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center border-2 
                  ${currentStep > step.id ? 'bg-blue-600 border-blue-600 text-white' : 
                    currentStep === step.id ? 'border-blue-600 text-blue-600' : 'border-gray-300 text-gray-400 dark:border-gray-600'}`}>
                  <step.icon className="w-5 h-5" />
                </div>
                <span className={`mt-2 text-xs font-medium hidden sm:block
                  ${currentStep >= step.id ? 'text-gray-900 dark:text-white' : 'text-gray-500 dark:text-gray-400'}`}>
                  {step.name}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Form Container */}
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl overflow-hidden border border-gray-100 dark:border-gray-700">
          <div className="p-6 sm:p-8">
            
            {/* Common Status Messages */}
            {testError && (
              <div className="mb-6 bg-red-50 dark:bg-red-900/20 border-l-4 border-red-500 p-4">
                <div className="flex">
                  <div className="flex-shrink-0">
                    <AlertCircle className="h-5 w-5 text-red-500" />
                  </div>
                  <div className="ml-3">
                    <p className="text-sm text-red-700 dark:text-red-400">{testError}</p>
                  </div>
                </div>
              </div>
            )}

            {testSuccess && (
              <div className="mb-6 bg-green-50 dark:bg-green-900/20 border-l-4 border-green-500 p-4">
                <div className="flex">
                  <div className="flex-shrink-0">
                    <CheckCircle className="h-5 w-5 text-green-500" />
                  </div>
                  <div className="ml-3">
                    <p className="text-sm text-green-700 dark:text-green-400">{testSuccess}</p>
                  </div>
                </div>
              </div>
            )}

            {/* Step 1: Database */}
            {currentStep === 1 && (
              <div className="space-y-6">
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-medium text-gray-900 dark:text-white">PostgreSQL 数据库配置</h3>
                  </div>
                  
                  <div className="mb-6 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg text-sm text-blue-800 dark:text-blue-300">
                    <p className="font-semibold mb-1">部署提示：</p>
                    <ul className="list-disc list-inside space-y-1 ml-2">
                      <li><strong>本地开发/源码部署</strong>：填 `127.0.0.1` 或 `localhost`。</li>
                      <li><strong>Docker 部署</strong>：如果使用官方 docker-compose，主机名填 `postgres`，默认用户名/数据库均为 `subiohub`，密码为你在 `.env` 中设置的密码。</li>
                    </ul>
                  </div>

                  <div className="grid grid-cols-1 gap-y-6 gap-x-4 sm:grid-cols-2">
                    <div className="sm:col-span-1">
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">主机地址 (Host)</label>
                      <input type="text" value={dbForm.host} onChange={e => setDbForm({...dbForm, host: e.target.value})} 
                        className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white" />
                    </div>
                    <div className="sm:col-span-1">
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">端口 (Port)</label>
                      <input type="number" value={dbForm.port} onChange={e => setDbForm({...dbForm, port: parseInt(e.target.value)})} 
                        className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white" />
                    </div>
                    <div className="sm:col-span-1">
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">用户名 (User)</label>
                      <input type="text" value={dbForm.user} onChange={e => setDbForm({...dbForm, user: e.target.value})} 
                        className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white" />
                    </div>
                    <div className="sm:col-span-1">
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">密码 (Password)</label>
                      <div className="relative mt-1">
                        <input type={showDbPassword ? "text" : "password"} value={dbForm.password} onChange={e => setDbForm({...dbForm, password: e.target.value})} 
                          className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white" />
                        <button type="button" onClick={() => setShowDbPassword(!showDbPassword)} className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
                          {showDbPassword ? <Eye className="h-5 w-5" /> : <EyeOff className="h-5 w-5" />}
                        </button>
                      </div>
                    </div>
                    <div className="sm:col-span-1">
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">数据库名 (DB Name)</label>
                      <input type="text" value={dbForm.dbname} onChange={e => setDbForm({...dbForm, dbname: e.target.value})} 
                        className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white" />
                      <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">可自定义为您在 PostgreSQL 中创建的数据库名称</p>
                    </div>
                    <div className="sm:col-span-1">
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">SSL 模式</label>
                      <select value={dbForm.sslmode} onChange={e => setDbForm({...dbForm, sslmode: e.target.value})}
                        className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white">
                        <option value="disable">Disable (本地推荐)</option>
                        <option value="require">Require (云数据库推荐)</option>
                        <option value="verify-ca">Verify-CA</option>
                        <option value="verify-full">Verify-Full</option>
                      </select>
                      <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">本地或内网数据库选 Disable；云数据库(如 Supabase) 通常选 Require</p>
                    </div>
                  </div>
                </div>
                <div className="flex justify-end pt-4 border-t border-gray-200 dark:border-gray-700">
                  <button onClick={handleTestDB} disabled={isTesting}
                    className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50">
                    {isTesting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : '测试并继续'}
                    {!isTesting && <ChevronRight className="w-4 h-4 ml-2" />}
                  </button>
                </div>
              </div>
            )}

            {/* Step 2: Redis */}
            {currentStep === 2 && (
              <div className="space-y-6">
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-medium text-gray-900 dark:text-white">Redis 缓存配置</h3>
                  </div>
                  
                  <div className="mb-6 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg text-sm text-blue-800 dark:text-blue-300">
                    <p className="font-semibold mb-1">部署提示：</p>
                    <ul className="list-disc list-inside space-y-1 ml-2">
                      <li><strong>本地开发/源码部署</strong>：填 `127.0.0.1`，若未设置密码则留空。</li>
                      <li><strong>Docker 部署</strong>：如果使用官方 docker-compose，主机名填 `redis`，密码留空。</li>
                    </ul>
                  </div>

                  <div className="grid grid-cols-1 gap-y-6 gap-x-4 sm:grid-cols-2">
                    <div className="sm:col-span-1">
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">主机地址 (Host)</label>
                      <input type="text" value={redisForm.host} onChange={e => setRedisForm({...redisForm, host: e.target.value})} 
                        className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white" />
                    </div>
                    <div className="sm:col-span-1">
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">端口 (Port)</label>
                      <input type="number" value={redisForm.port} onChange={e => setRedisForm({...redisForm, port: parseInt(e.target.value)})} 
                        className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white" />
                    </div>
                    <div className="sm:col-span-1">
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">密码 (Password，选填)</label>
                      <div className="relative mt-1">
                        <input type={showRedisPassword ? "text" : "password"} value={redisForm.password} onChange={e => setRedisForm({...redisForm, password: e.target.value})} 
                          className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white" />
                        <button type="button" onClick={() => setShowRedisPassword(!showRedisPassword)} className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
                          {showRedisPassword ? <Eye className="h-5 w-5" /> : <EyeOff className="h-5 w-5" />}
                        </button>
                      </div>
                    </div>
                    <div className="sm:col-span-1">
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">数据库索引 (DB, 0-15)</label>
                      <input type="number" value={redisForm.db} onChange={e => setRedisForm({...redisForm, db: parseInt(e.target.value)})} 
                        className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white" />
                    </div>
                    <div className="sm:col-span-2">
                      <div className="flex items-center mt-2">
                        <input type="checkbox" id="tls" checked={redisForm.enable_tls} onChange={e => setRedisForm({...redisForm, enable_tls: e.target.checked})}
                          className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded" />
                        <label htmlFor="tls" className="ml-2 block text-sm text-gray-900 dark:text-gray-300">
                          启用 TLS 连接 (例如阿里云 Redis)
                        </label>
                      </div>
                    </div>
                  </div>
                </div>
                <div className="flex justify-between pt-4 border-t border-gray-200 dark:border-gray-700">
                  <button onClick={() => setCurrentStep(1)} disabled={isTesting}
                    className="inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md shadow-sm text-gray-700 bg-white hover:bg-gray-50 focus:outline-none dark:bg-gray-700 dark:text-gray-200 dark:border-gray-600 dark:hover:bg-gray-600">
                    返回上一步
                  </button>
                  <button onClick={handleTestRedis} disabled={isTesting}
                    className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50">
                    {isTesting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : '测试并继续'}
                    {!isTesting && <ChevronRight className="w-4 h-4 ml-2" />}
                  </button>
                </div>
              </div>
            )}

            {/* Step 3: Admin & Server */}
            {currentStep === 3 && (
              <div className="space-y-6">
                <div>
                  <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-4">系统管理员与基础配置</h3>
                  <div className="grid grid-cols-1 gap-y-6 gap-x-4 sm:grid-cols-2">
                    <div className="sm:col-span-2">
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">管理员邮箱</label>
                      <input type="email" value={adminForm.email} onChange={e => setAdminForm({...adminForm, email: e.target.value})} 
                        className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white" />
                    </div>
                    <div className="sm:col-span-2">
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">管理员密码 (至少8位)</label>
                      <div className="relative mt-1">
                        <input type={showAdminPassword ? "text" : "password"} value={adminForm.password} onChange={e => setAdminForm({...adminForm, password: e.target.value})} 
                          className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white" />
                        <button type="button" onClick={() => setShowAdminPassword(!showAdminPassword)} className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
                          {showAdminPassword ? <Eye className="h-5 w-5" /> : <EyeOff className="h-5 w-5" />}
                        </button>
                      </div>
                    </div>
                    <div className="sm:col-span-2 border-t border-gray-200 dark:border-gray-700 pt-4 mt-2">
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">后端监听端口 (默认8080)</label>
                      <input type="number" value={serverForm.port} onChange={e => setServerForm({...serverForm, port: parseInt(e.target.value)})} 
                        className="mt-1 block w-full sm:w-1/2 px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white" />
                      <p className="mt-2 text-xs text-gray-500">注意: 安装完成后后端会自动重启应用配置</p>
                    </div>
                  </div>
                </div>
                <div className="flex justify-between pt-4 border-t border-gray-200 dark:border-gray-700">
                  <button onClick={() => setCurrentStep(2)} disabled={isTesting}
                    className="inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md shadow-sm text-gray-700 bg-white hover:bg-gray-50 focus:outline-none dark:bg-gray-700 dark:text-gray-200 dark:border-gray-600 dark:hover:bg-gray-600">
                    返回上一步
                  </button>
                  <button onClick={handleInstall} disabled={isTesting || !adminForm.email || adminForm.password.length < 8}
                    className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 disabled:opacity-50">
                    {isTesting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : '完成安装'}
                    {!isTesting && <CheckCircle className="w-4 h-4 ml-2" />}
                  </button>
                </div>
              </div>
            )}

            {/* Step 4: Success */}
            {currentStep === 4 && (
              <div className="text-center py-10">
                <CheckCircle className="mx-auto h-16 w-16 text-green-500 mb-6" />
                <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">安装成功！</h2>
                <p className="text-gray-600 dark:text-gray-400 mb-8">
                  SubioHub 系统已成功初始化。后端服务正在重启以应用新配置。
                </p>
                <button onClick={() => {
                    // Give backend a moment to restart
                    setTimeout(() => router.push('/login'), 1500);
                  }}
                  className="inline-flex items-center px-6 py-3 border border-transparent text-base font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500">
                  前往登录
                </button>
              </div>
            )}

          </div>
        </div>
      </div>
    </div>
  );
}

