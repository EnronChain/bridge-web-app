import { ReactElement, useEffect, useState } from 'react'
import styled from 'styled-components'
import { useRecoilState, useRecoilValue, useSetRecoilState } from 'recoil'
import _ from 'lodash'
import { useDebouncedCallback } from 'use-debounce'
import BigNumber from 'bignumber.js'
import { ArrowClockwise } from 'react-bootstrap-icons'

import { ASSET, COLOR } from 'consts'

import { BlockChainType, BridgeType } from 'types/network'
import { ValidateItemResultType } from 'types/send'
import { AxelarAPI } from 'packages/axelar/axelarAPI'
import { Text, Row } from 'components'
import FormLabel from 'components/FormLabel'
import FormErrorMessage from 'components/FormErrorMessage'
import FormLabelInput from 'components/FormLabelInput'

import useSend from 'hooks/useSend'
import useShuttle from 'hooks/useShuttle'
import useSendValidate from 'hooks/useSendValidate'
import useAsset from 'hooks/useAsset'

import AuthStore from 'store/AuthStore'
import SendStore from 'store/SendStore'

import AssetList from './AssetList'
import CopyTokenAddress from './CopyTokenAddress'
import FormFeeInfo from './FormFeeInfo'
import NetworkStore from 'store/NetworkStore'
import getWormholeFees from 'packages/wormhole/fees'

import swapArrowImg from '../../../images/swapArrow.svg'
import SlippageInput from 'components/SlippageInput'
import { getThorAssets } from 'packages/thorswap/getAssets'
import { thorChainName, ThorBlockChains } from 'packages/thorswap/thorNames'
import { getThorOutboundFees } from 'packages/thorswap/getFees'
import getExchangeRate from 'packages/thorswap/getExchangeRate'
import ExchangeRateInfo from './ExchangeRateInfo'
import getSwapOutput from 'packages/thorswap/getOutput'

const StyledContainer = styled.div``

const StyledFormSection = styled.div`
  margin-bottom: 40px;
`

const StyledMaxButton = styled.div`
  position: absolute;
  top: 50%;
  margin-top: -13px;
  right: 0;
  background-color: ${COLOR.darkGray2};
  font-size: 12px;
  border-radius: 5px;
  padding: 0 10px;
  line-height: 24px;
  height: 26px;
  display: flex;
  align-items: center;

  cursor: pointer;
  :hover {
    background-color: #323842;
  }
`

const StyledRefreshButton = styled.div<{ refreshing: boolean }>`
  display: flex;
  align-items: center;
  color: ${COLOR.primary};
  font-size: 12px;
  font-weight: bold;
  opacity: ${({ refreshing }): number => (refreshing ? 0.5 : 1)};
  cursor: ${({ refreshing }): string => (refreshing ? 'default' : 'pointer')};
  user-select: none;
`

const StyledSwitchSwapButton = styled.img`
  display: block;
  margin: 0 auto;
`

const RefreshButton = (): ReactElement => {
  const isLoggedIn = useRecoilValue(AuthStore.isLoggedIn)
  const { getAssetList } = useAsset()
  const [refreshing, setRefreshing] = useState(false)
  const dbcRefresh = useDebouncedCallback(() => {
    setRefreshing(true)
    getAssetList().finally((): void => {
      setTimeout(() => {
        setRefreshing(false)
      }, 500)
    })
  }, 300)

  return (
    <>
      {isLoggedIn && (
        <StyledRefreshButton
          onClick={(): void => {
            dbcRefresh.callback()
          }}
          refreshing={refreshing}
        >
          <ArrowClockwise style={{ marginRight: 5 }} size={14} />
          <Text
            style={{
              fontWeight: 500,
              fontSize: 10,
              color: COLOR.terraSky,
            }}
          >
            {refreshing ? 'REFRESHING...' : 'REFRESH'}
          </Text>
        </StyledRefreshButton>
      )}
    </>
  )
}

export const SendForm = ({
  feeValidationResult,
}: {
  feeValidationResult: ValidateItemResultType
}): ReactElement => {
  const loginUser = useRecoilValue(AuthStore.loginUser)
  const isLoggedIn = useRecoilValue(AuthStore.isLoggedIn)

  // Send Data
  const asset = useRecoilValue(SendStore.asset)
  const [toAddress, setToAddress] = useRecoilState(SendStore.toAddress)
  const [amount, setAmount] = useRecoilState(SendStore.amount)
  const [memo, setMemo] = useRecoilState(SendStore.memo)
  const toBlockChain = useRecoilValue(SendStore.toBlockChain)
  const fromBlockChain = useRecoilValue(SendStore.fromBlockChain)

  // Computed data from Send data
  const setGasFeeList = useSetRecoilState(SendStore.gasFeeList)
  const setBridgeFeeAmount = useSetRecoilState(SendStore.bridgeFee)
  const setAmountAfterBridgeFee = useSetRecoilState(
    SendStore.amountAfterBridgeFee
  )

  const bridgeUsed = useRecoilValue(SendStore.bridgeUsed)

  const [validationResult, setValidationResult] = useRecoilState(
    SendStore.validationResult
  )

  const isTestnet = useRecoilValue(NetworkStore.isTestnet)

  const [inputAmount, setInputAmount] = useState('')

  const { getTerraShuttleFee } = useShuttle()
  const { formatBalance, getAssetList } = useAsset()
  const { getTerraFeeList } = useSend()
  const { validateSendData } = useSendValidate()

  const onChangeToAddress = ({ value }: { value: string }): void => {
    setToAddress(value)
  }

  const onChangeAmount = ({ value }: { value: string }): void => {
    if (_.isEmpty(value)) {
      setInputAmount('')
      setAmount('')
      return
    }

    if (false === _.isNaN(_.toNumber(value))) {
      setInputAmount(value)
      const decimalSize = new BigNumber(
        fromBlockChain === BlockChainType.terra ||
        bridgeUsed === BridgeType.ibc ||
        bridgeUsed === BridgeType.axelar ||
        bridgeUsed === BridgeType.wormhole
          ? ASSET.TERRA_DECIMAL
          : ASSET.ETHER_BASE_DECIMAL
      )
      setAmount(new BigNumber(value).times(decimalSize).toString(10))
    }
  }

  const onChangeMemo = ({ value }: { value: string }): void => {
    setMemo(value)
  }

  const onClickMaxButton = async (): Promise<void> => {
    const assetAmount = new BigNumber(asset?.balance || 0).minus(
      asset?.terraToken === 'uusd' && fromBlockChain === BlockChainType.terra
        ? 300_000 // 0.3 UST for tx fee
        : 0
    )
    onChangeAmount({
      value: formatBalance(assetAmount.isLessThan(0) ? '0' : assetAmount),
    })
  }

  const setBridgeFee = async (): Promise<void> => {
    // shuttle fee
    if (bridgeUsed === BridgeType.shuttle) {
      const sendAmount = new BigNumber(amount)
      if (sendAmount.isGreaterThan(0)) {
        if (fromBlockChain === BlockChainType.terra) {
          getTerraShuttleFee({
            denom: asset?.terraToken || '',
            amount: sendAmount,
          }).then((shuttleFee) => {
            setBridgeFeeAmount(shuttleFee)
            const computedAmount = sendAmount.minus(shuttleFee)
            setAmountAfterBridgeFee(
              computedAmount.isGreaterThan(0)
                ? computedAmount
                : new BigNumber(0)
            )
          })
        } else {
          // no shuttle fee EVM -> terra
          setBridgeFeeAmount(new BigNumber(0))
          setAmountAfterBridgeFee(sendAmount)
        }
      }
    } else if (bridgeUsed === BridgeType.axelar) {
      const api = new AxelarAPI('mainnet')
      const fee = await api.getTransferFee(
        fromBlockChain,
        toBlockChain,
        asset?.terraToken || ''
      )
      setBridgeFeeAmount(new BigNumber(fee))
      const computedAmount = new BigNumber(amount).minus(fee)
      setAmountAfterBridgeFee(
        computedAmount.isGreaterThan(0) ? computedAmount : new BigNumber(0)
      )
    } else if (bridgeUsed === BridgeType.wormhole) {
      const wormholeFee = new BigNumber(
        await getWormholeFees(toBlockChain, asset?.terraToken || '')
      )
      setBridgeFeeAmount(wormholeFee)
      const computedAmount = new BigNumber(amount).minus(wormholeFee)
      setAmountAfterBridgeFee(
        computedAmount.isGreaterThan(0) ? computedAmount : new BigNumber(0)
      )
    } else if (bridgeUsed === BridgeType.thorswap) {
      // leave as it is, we have already calculated it
    } else {
      setBridgeFeeAmount(new BigNumber(0))
      setAmountAfterBridgeFee(new BigNumber(amount))
    }
  }

  // It's for Fee(gas) and ShuttleFee
  const dbcGetFeeInfoWithValidation = useDebouncedCallback(async () => {
    // set false while waiting for verification
    setValidationResult({ isValid: false })
    const sendDataResult = await validateSendData()
    setValidationResult(sendDataResult)

    const ableToGetFeeInfo = isLoggedIn && amount && toAddress

    if (asset?.terraToken && ableToGetFeeInfo) {
      if (sendDataResult.isValid) {
        // get terra Send Fee Info
        const terraFeeList = await getTerraFeeList()
        setGasFeeList(terraFeeList)
      }

      setBridgeFee()
    }
  }, 300)

  //get terra send fee info
  useEffect(() => {
    dbcGetFeeInfoWithValidation.callback()
    return (): void => {
      dbcGetFeeInfoWithValidation.cancel()
    }
  }, [amount, toAddress, toBlockChain, fromBlockChain, memo, asset, bridgeUsed])

  useEffect(() => {
    onChangeAmount({ value: inputAmount })
    getAssetList().then((): void => {
      dbcGetFeeInfoWithValidation.callback()
    })
  }, [
    // to check decimal length by network
    loginUser,
    // to check if asset valid by network
    toBlockChain,
    fromBlockChain,
    bridgeUsed,
    isTestnet,
  ])

  return (
    <StyledContainer>
      <StyledFormSection>
        <Row style={{ justifyContent: 'space-between' }}>
          <FormLabel title={'Asset'} />
          <RefreshButton />
        </Row>

        <AssetList {...{ selectedAsset: asset, onChangeAmount }} />
        <FormErrorMessage
          errorMessage={validationResult.errorMessage?.asset}
          style={{ marginBottom: 0 }}
        />
        <CopyTokenAddress />
      </StyledFormSection>

      <StyledFormSection>
        <div style={{ position: 'relative' }}>
          <FormLabelInput
            inputProps={{
              type: 'number',
              value: inputAmount,
              onChange: ({ target: { value } }): void => {
                onChangeAmount({ value })
              },
            }}
            labelProps={{ children: 'Amount' }}
          />
          <StyledMaxButton onClick={onClickMaxButton}>Max</StyledMaxButton>
        </div>

        {isLoggedIn && (
          <FormErrorMessage
            errorMessage={validationResult.errorMessage?.amount}
          />
        )}
      </StyledFormSection>

      <StyledFormSection>
        <FormLabelInput
          inputProps={{
            value: toAddress,
            onChange: ({ target: { value } }): void => {
              onChangeToAddress({ value })
            },
          }}
          labelProps={{ children: 'Destination Address' }}
        />
        <FormErrorMessage
          errorMessage={validationResult.errorMessage?.toAddress}
        />
      </StyledFormSection>

      {fromBlockChain === BlockChainType.terra &&
        toBlockChain === BlockChainType.terra && (
          <StyledFormSection>
            <FormLabelInput
              inputProps={{
                value: memo,
                onChange: ({ target: { value } }): void => {
                  onChangeMemo({ value })
                },
              }}
              labelProps={{ children: 'Memo (optional)' }}
            />
            <FormErrorMessage
              errorMessage={validationResult.errorMessage?.memo}
            />
          </StyledFormSection>
        )}

      <FormFeeInfo feeValidationResult={feeValidationResult} />
    </StyledContainer>
  )
}

export const SwapForm = ({
  feeValidationResult,
}: {
  feeValidationResult: ValidateItemResultType
}): ReactElement => {
  const loginUser = useRecoilValue(AuthStore.loginUser)
  const isLoggedIn = useRecoilValue(AuthStore.isLoggedIn)

  // Send Data
  const asset = useRecoilValue(SendStore.asset)
  const [toAddress, setToAddress] = useRecoilState(SendStore.toAddress)
  const [amount, setAmount] = useRecoilState(SendStore.amount)
  const [memo, setMemo] = useRecoilState(SendStore.memo)
  const toBlockChain = useRecoilValue(SendStore.toBlockChain)
  const fromBlockChain = useRecoilValue(SendStore.fromBlockChain)
  const [isLoadingRates, setLoadingRates] = useRecoilState(
    SendStore.isLoadingRates
  )

  const setToAssetList = useSetRecoilState(SendStore.toAssetList)
  const [toAsset, setToAsset] = useRecoilState(SendStore.toAsset)

  // Computed data from Send data
  const setGasFeeList = useSetRecoilState(SendStore.gasFeeList)
  const bridgeUsed = useRecoilValue(SendStore.bridgeUsed)
  const setBridgeFeeAmount = useSetRecoilState(SendStore.bridgeFee)
  const [amountAfterBridgeFee, setAmountAfterBridgeFee] = useRecoilState(
    SendStore.amountAfterBridgeFee
  )
  const setExchangeRate = useSetRecoilState(SendStore.exchangeRate)

  const [validationResult, setValidationResult] = useRecoilState(
    SendStore.validationResult
  )

  const isTestnet = useRecoilValue(NetworkStore.isTestnet)

  const [inputAmount, setInputAmount] = useState('')

  const { formatBalance, getAssetList, getDecimals } = useAsset()
  const { getTerraFeeList } = useSend()
  const { validateSendData } = useSendValidate()

  const onChangeToAddress = ({ value }: { value: string }): void => {
    setToAddress(value)
  }

  const onChangeAmount = ({ value }: { value: string }): void => {
    if (_.isEmpty(value)) {
      setInputAmount('')
      setAmount('')
      return
    }

    if (false === _.isNaN(_.toNumber(value))) {
      setInputAmount(value)
      const decimalSize = new BigNumber(
        fromBlockChain === BlockChainType.terra ||
        bridgeUsed === BridgeType.ibc ||
        bridgeUsed === BridgeType.axelar ||
        bridgeUsed === BridgeType.wormhole
          ? ASSET.TERRA_DECIMAL
          : ASSET.ETHER_BASE_DECIMAL
      )
      setAmount(new BigNumber(value).times(decimalSize).toString(10))
    }
  }

  const onChangeMemo = ({ value }: { value: string }): void => {
    setMemo(value)
  }

  const onClickMaxButton = async (): Promise<void> => {
    const assetAmount = new BigNumber(asset?.balance || 0).minus(
      asset?.terraToken === 'uusd' && fromBlockChain === BlockChainType.terra
        ? 300_000 // 0.3 UST for tx fee
        : 0
    )
    onChangeAmount({
      value: formatBalance(assetAmount.isLessThan(0) ? '0' : assetAmount),
    })
  }

  // It's for Fee(gas) and ShuttleFee
  const dbcGetFeeInfoWithValidation = useDebouncedCallback(async () => {
    // set false while waiting for verification
    setValidationResult({ isValid: false })
    const sendDataResult = await validateSendData()
    setValidationResult(sendDataResult)

    const ableToGetFeeInfo = isLoggedIn && amount && toAddress

    if (asset?.terraToken && ableToGetFeeInfo) {
      if (sendDataResult.isValid) {
        // get terra Send Fee Info
        const terraFeeList = await getTerraFeeList()
        setGasFeeList(terraFeeList)
      }
    }
  }, 300)

  //get terra send fee info
  useEffect(() => {
    dbcGetFeeInfoWithValidation.callback()
    return (): void => {
      dbcGetFeeInfoWithValidation.cancel()
    }
  }, [amount, toAddress, toBlockChain, fromBlockChain, memo, asset, bridgeUsed])

  useEffect(() => {
    onChangeAmount({ value: inputAmount })
    getAssetList().then((): void => {
      dbcGetFeeInfoWithValidation.callback()
    })

    getThorAssets(thorChainName[toBlockChain as ThorBlockChains]).then(
      (list): void => {
        setToAssetList(list)
        setToAsset(list[0])
      }
    )
  }, [
    // to check decimal length by network
    loginUser,
    // to check if asset valid by network
    toBlockChain,
    fromBlockChain,
    bridgeUsed,
    isTestnet,
  ])

  // calculate swap result (thorswap)
  useEffect(() => {
    let update = true
    let interval: NodeJS.Timeout | null
    if (bridgeUsed === BridgeType.thorswap) {
      setLoadingRates(true)
      const thorAsset = `${
        thorChainName[fromBlockChain as ThorBlockChains]
      }.${asset?.symbol.toUpperCase()}`

      interval = setTimeout((): void => {
        if (!amount || parseFloat(amount) === 0) {
          getExchangeRate(thorAsset, toAsset?.thorId || '').then(
            (result): void => {
              if (update) {
                setExchangeRate(result)
                setLoadingRates(false)
                setAmountAfterBridgeFee(new BigNumber(0))
              }
            }
          )
        } else {
          Promise.all([
            getExchangeRate(thorAsset, toAsset?.thorId || ''),
            getSwapOutput(
              thorAsset,
              toAsset?.thorId || '',
              Number(amount) / getDecimals()
            ),
          ]).then(([rates, output]): void => {
            if (update) {
              setExchangeRate(rates)
              setAmountAfterBridgeFee(
                new BigNumber(output).multipliedBy(getDecimals())
              )
              setLoadingRates(false)
            }
          })
        }
      }, 200)

      return (): void => {
        // cancel the subscription
        interval && clearTimeout(interval)
        update = false
      }
    }
  }, [amount, toBlockChain, fromBlockChain, asset, toAsset, bridgeUsed])

  // calculate swap tx fee (thorswap)
  useEffect(() => {
    let update = true
    if (bridgeUsed === BridgeType.thorswap) {
      ;(async (): Promise<void> => {
        const estimatedResult = await getThorOutboundFees(
          toBlockChain,
          toAsset?.thorId || ''
        )
        update &&
          setBridgeFeeAmount(
            new BigNumber(estimatedResult).multipliedBy(getDecimals())
          )
      })()
    }

    return (): void => {
      // cancel the subscription
      update = false
    }
  }, [toBlockChain, toAsset, bridgeUsed])

  function formatSwapAmount(amount: BigNumber): string {
    return amount ? formatBalance(amount) : ''
  }

  return (
    <StyledContainer>
      <StyledFormSection style={{ marginBottom: 20 }}>
        <Row style={{ justifyContent: 'space-between' }}>
          <FormLabel title={'From'} />

          <Row style={{ justifyContent: 'flex-end' }}>
            <FormLabel
              title={'AVAILABLE   ' + formatBalance(asset?.balance || '0')}
            />
            <div style={{ width: '10px' }}></div>
            <RefreshButton />
          </Row>
        </Row>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <div style={{ width: '25%' }}>
            <AssetList swap {...{ selectedAsset: asset, onChangeAmount }} />
          </div>

          <div style={{ position: 'relative', width: '75%' }}>
            <FormLabelInput
              inputProps={{
                type: 'number',
                value: inputAmount,
                style: {
                  textAlign: 'right',
                  paddingRight: '55px',
                },
                onChange: ({ target: { value } }): void => {
                  onChangeAmount({ value })
                },
              }}
              labelProps={{ children: '' }}
            />
            <StyledMaxButton onClick={onClickMaxButton}>Max</StyledMaxButton>
          </div>
        </div>
        <FormErrorMessage
          errorMessage={
            validationResult.errorMessage?.asset ||
            validationResult.errorMessage?.amount
          }
          style={{ marginBottom: 0 }}
        />
      </StyledFormSection>

      <StyledSwitchSwapButton src={swapArrowImg} alt="Swap" />

      <StyledFormSection style={{ marginBottom: 10, marginTop: -5 }}>
        <Row style={{ justifyContent: 'space-between' }}>
          <FormLabel title={'To'} />
        </Row>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <div style={{ width: '25%' }}>
            <AssetList swap {...{ selectedAsset: toAsset, to: true }} />
          </div>

          <div style={{ position: 'relative', width: '75%' }}>
            <FormLabelInput
              inputProps={{
                value: isLoadingRates
                  ? 'loading ...'
                  : amount && formatSwapAmount(amountAfterBridgeFee),
                disabled: true,
                style: {
                  textAlign: 'right',
                  color: isLoadingRates ? '#727272' : COLOR.white,
                },
              }}
              labelProps={{ children: '' }}
            />
          </div>
        </div>
        <FormErrorMessage
          errorMessage={validationResult.errorMessage?.asset}
          style={{ marginBottom: 0 }}
        />
      </StyledFormSection>

      <SlippageInput />

      <StyledFormSection>
        <FormLabelInput
          inputProps={{
            value: toAddress,
            onChange: ({ target: { value } }): void => {
              onChangeToAddress({ value })
            },
          }}
          labelProps={{ children: 'Destination Address' }}
        />
        <FormErrorMessage
          errorMessage={validationResult.errorMessage?.toAddress}
        />
      </StyledFormSection>

      {fromBlockChain === BlockChainType.terra &&
        toBlockChain === BlockChainType.terra && (
          <StyledFormSection>
            <FormLabelInput
              inputProps={{
                value: memo,
                onChange: ({ target: { value } }): void => {
                  onChangeMemo({ value })
                },
              }}
              labelProps={{ children: 'Memo (optional)' }}
            />
            <FormErrorMessage
              errorMessage={validationResult.errorMessage?.memo}
            />
          </StyledFormSection>
        )}
      <ExchangeRateInfo />
      <FormFeeInfo feeValidationResult={feeValidationResult} />
    </StyledContainer>
  )
}
