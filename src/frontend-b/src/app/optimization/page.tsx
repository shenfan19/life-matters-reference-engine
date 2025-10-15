"use client"

import { useState, useEffect } from "react"
import { SidebarTrigger } from "@/components/ui/sidebar"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Zap, TrendingUp } from "lucide-react"
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ScatterChart, Scatter } from "recharts"

export default function OptimizationPage() {
  const [isOptimizing, setIsOptimizing] = useState(false)
  const [optimizationProgress, setOptimizationProgress] = useState(0)
  const [optimizationResults, setOptimizationResults] = useState<any[]>([])
  const [bestResult, setBestResult] = useState<any>(null)
  const [simulationPreview, setSimulationPreview] = useState<any[]>([])

  const [optimizationParams, setOptimizationParams] = useState({
    targetValue: "0",
    maxIterations: "50",
    tolerance: "0.001",
    learningRate: "0.1",
  })

  const [targetParams, setTargetParams] = useState({
    amplitude: "5-15",
    frequency: "0.5-2",
    damping: "0.05-0.2",
  })

  useEffect(() => {
    if (isOptimizing) {
      const interval = setInterval(() => {
        setOptimizationProgress((prev) => {
          if (prev >= 100) {
            setIsOptimizing(false)
            return 100
          }

          const newProgress = prev + 2

          // 模拟优化过程生成结果
          const iteration = Math.floor(newProgress / 2)
          const cost = 100 * Math.exp(-iteration / 10) + Math.random() * 10
          const amplitude = 10 + (Math.random() - 0.5) * 4
          const frequency = 1 + (Math.random() - 0.5) * 0.5

          setOptimizationResults((prevResults) => {
            const newResults = [
              ...prevResults,
              {
                iteration,
                cost: parseFloat(cost.toFixed(2)),
                amplitude: parseFloat(amplitude.toFixed(2)),
                frequency: parseFloat(frequency.toFixed(2)),
              },
            ]

            // 更新最佳结果
            const best = newResults.reduce((min, curr) => (curr.cost < min.cost ? curr : min))
            setBestResult(best)

            return newResults
          })

          // 生成仿真预览数据
          if (newProgress % 20 === 0) {
            const previewData = []
            for (let t = 0; t <= 10; t += 0.1) {
              previewData.push({
                time: parseFloat(t.toFixed(2)),
                value: amplitude * Math.sin(2 * Math.PI * frequency * t) * Math.exp(-0.1 * t),
              })
            }
            setSimulationPreview(previewData)
          }

          return newProgress
        })
      }, 100)

      return () => clearInterval(interval)
    }
  }, [isOptimizing])

  const handleStartOptimization = () => {
    setOptimizationProgress(0)
    setOptimizationResults([])
    setBestResult(null)
    setSimulationPreview([])
    setIsOptimizing(true)
  }

  return (
    <div className="flex flex-col h-full">
      <header className="border-b">
        <div className="flex h-16 items-center px-6">
          <SidebarTrigger />
          <h1 className="text-2xl font-bold ml-4">优化</h1>
        </div>
      </header>

      <div className="flex-1 p-6 overflow-auto">
        <div className="max-w-7xl mx-auto space-y-6">
          <Tabs defaultValue="setup" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="setup">优化设置</TabsTrigger>
              <TabsTrigger value="results">优化结果</TabsTrigger>
            </TabsList>

            <TabsContent value="setup" className="space-y-6">
              {/* 优化参数 */}
              <Card>
                <CardHeader>
                  <CardTitle>优化参数</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="targetValue">目标值</Label>
                      <Input
                        id="targetValue"
                        type="number"
                        value={optimizationParams.targetValue}
                        onChange={(e) =>
                          setOptimizationParams({ ...optimizationParams, targetValue: e.target.value })
                        }
                        disabled={isOptimizing}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="maxIterations">最大迭代次数</Label>
                      <Input
                        id="maxIterations"
                        type="number"
                        value={optimizationParams.maxIterations}
                        onChange={(e) =>
                          setOptimizationParams({ ...optimizationParams, maxIterations: e.target.value })
                        }
                        disabled={isOptimizing}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="tolerance">收敛容差</Label>
                      <Input
                        id="tolerance"
                        type="number"
                        value={optimizationParams.tolerance}
                        onChange={(e) =>
                          setOptimizationParams({ ...optimizationParams, tolerance: e.target.value })
                        }
                        disabled={isOptimizing}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="learningRate">学习率</Label>
                      <Input
                        id="learningRate"
                        type="number"
                        value={optimizationParams.learningRate}
                        onChange={(e) =>
                          setOptimizationParams({ ...optimizationParams, learningRate: e.target.value })
                        }
                        disabled={isOptimizing}
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* 目标参数范围 */}
              <Card>
                <CardHeader>
                  <CardTitle>目标参数范围</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-3 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="amplitudeRange">振幅范围</Label>
                      <Input
                        id="amplitudeRange"
                        value={targetParams.amplitude}
                        onChange={(e) => setTargetParams({ ...targetParams, amplitude: e.target.value })}
                        disabled={isOptimizing}
                        placeholder="最小-最大"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="frequencyRange">频率范围</Label>
                      <Input
                        id="frequencyRange"
                        value={targetParams.frequency}
                        onChange={(e) => setTargetParams({ ...targetParams, frequency: e.target.value })}
                        disabled={isOptimizing}
                        placeholder="最小-最大"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="dampingRange">阻尼范围</Label>
                      <Input
                        id="dampingRange"
                        value={targetParams.damping}
                        onChange={(e) => setTargetParams({ ...targetParams, damping: e.target.value })}
                        disabled={isOptimizing}
                        placeholder="最小-最大"
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* 控制按钮 */}
              <Card>
                <CardContent className="pt-6">
                  <div className="flex flex-col items-center gap-4">
                    <Button
                      onClick={handleStartOptimization}
                      disabled={isOptimizing}
                      size="lg"
                      className="w-64"
                    >
                      <Zap className="mr-2 h-4 w-4" />
                      {isOptimizing ? `优化中... ${optimizationProgress}%` : "开始优化"}
                    </Button>
                    {isOptimizing && (
                      <div className="w-full max-w-md">
                        <div className="w-full bg-muted rounded-full h-2.5">
                          <div
                            className="bg-primary h-2.5 rounded-full transition-all"
                            style={{ width: `${optimizationProgress}%` }}
                          />
                        </div>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>

              {/* 嵌套仿真预览 */}
              {simulationPreview.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle>当前仿真预览</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={250}>
                      <LineChart data={simulationPreview}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="time" label={{ value: "时间 (s)", position: "insideBottom", offset: -5 }} />
                        <YAxis label={{ value: "幅值", angle: -90, position: "insideLeft" }} />
                        <Tooltip />
                        <Legend />
                        <Line type="monotone" dataKey="value" stroke="#8b5cf6" name="优化信号" dot={false} />
                      </LineChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
              )}
            </TabsContent>

            <TabsContent value="results" className="space-y-6">
              {/* 最佳结果 */}
              {bestResult && (
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <TrendingUp className="h-5 w-5 text-green-600" />
                      最佳结果
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-4 gap-4 text-center">
                      <div>
                        <div className="text-sm text-muted-foreground">迭代次数</div>
                        <div className="text-2xl font-bold">{bestResult.iteration}</div>
                      </div>
                      <div>
                        <div className="text-sm text-muted-foreground">成本函数</div>
                        <div className="text-2xl font-bold text-green-600">{bestResult.cost}</div>
                      </div>
                      <div>
                        <div className="text-sm text-muted-foreground">振幅</div>
                        <div className="text-2xl font-bold">{bestResult.amplitude}</div>
                      </div>
                      <div>
                        <div className="text-sm text-muted-foreground">频率</div>
                        <div className="text-2xl font-bold">{bestResult.frequency}</div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* 优化过程曲线 */}
              {optimizationResults.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle>优化收敛曲线</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={300}>
                      <LineChart data={optimizationResults}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="iteration" label={{ value: "迭代次数", position: "insideBottom", offset: -5 }} />
                        <YAxis label={{ value: "成本函数", angle: -90, position: "insideLeft" }} />
                        <Tooltip />
                        <Legend />
                        <Line type="monotone" dataKey="cost" stroke="#10b981" name="成本" dot={false} />
                      </LineChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
              )}

              {/* 参数空间分布 */}
              {optimizationResults.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle>参数空间探索</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={300}>
                      <ScatterChart>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="amplitude" name="振幅" />
                        <YAxis dataKey="frequency" name="频率" />
                        <Tooltip cursor={{ strokeDasharray: "3 3" }} />
                        <Legend />
                        <Scatter name="参数组合" data={optimizationResults} fill="#f59e0b" />
                      </ScatterChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
              )}
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  )
}
