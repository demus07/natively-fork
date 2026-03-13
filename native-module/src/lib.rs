use std::cell::RefCell;

use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use napi::bindgen_prelude::{Buffer, Result};
use napi::threadsafe_function::{ThreadsafeFunction, ThreadsafeFunctionCallMode};
use napi::{Env, JsFunction};
use napi_derive::napi;

thread_local! {
  static ACTIVE_STREAM: RefCell<Option<cpal::Stream>> = const { RefCell::new(None) };
}

fn downmix_to_i16(input: &[f32], channels: usize) -> Vec<i16> {
  let channel_count = channels.max(1);
  input
    .chunks(channel_count)
    .map(|frame| {
      let sum = frame.iter().copied().sum::<f32>();
      let mono = sum / frame.len() as f32;
      (mono.clamp(-1.0, 1.0) * i16::MAX as f32) as i16
    })
    .collect()
}

fn to_le_bytes(samples: &[i16]) -> Vec<u8> {
  samples
    .iter()
    .flat_map(|sample| sample.to_le_bytes())
    .collect::<Vec<u8>>()
}

fn create_tsfn(callback: JsFunction) -> Result<ThreadsafeFunction<Vec<u8>>> {
  callback.create_threadsafe_function(0, |ctx| Ok(vec![Buffer::from(ctx.value)]))
}

#[napi]
pub fn start_audio_capture(_env: Env, callback: JsFunction) -> Result<()> {
  let host = cpal::default_host();
  let input_device = host
    .default_input_device()
    .or_else(|| host.default_output_device())
    .ok_or_else(|| napi::Error::from_reason("No audio device available".to_string()))?;
  let supported_config = input_device
    .default_input_config()
    .or_else(|_| input_device.default_output_config())
    .map_err(|err| napi::Error::from_reason(err.to_string()))?;

  let sample_format = supported_config.sample_format();
  let stream_config: cpal::StreamConfig = supported_config.config();
  let channels = stream_config.channels as usize;
  let tsfn = create_tsfn(callback)?;
  let error_callback = |err| eprintln!("audio capture error: {err}");

  let stream = match sample_format {
    cpal::SampleFormat::F32 => input_device.build_input_stream(
      &stream_config,
      move |data: &[f32], _| {
        let mono = downmix_to_i16(data, channels);
        let _ = tsfn.call(Ok(to_le_bytes(&mono)), ThreadsafeFunctionCallMode::NonBlocking);
      },
      error_callback,
      None
    ),
    cpal::SampleFormat::I16 => input_device.build_input_stream(
      &stream_config,
      move |data: &[i16], _| {
        let mono = if channels <= 1 {
          data.to_vec()
        } else {
          data.chunks(channels).map(|frame| frame.iter().copied().sum::<i16>() / frame.len() as i16).collect()
        };
        let _ = tsfn.call(Ok(to_le_bytes(&mono)), ThreadsafeFunctionCallMode::NonBlocking);
      },
      error_callback,
      None
    ),
    other => {
      return Err(napi::Error::from_reason(format!(
        "Unsupported audio sample format: {other:?}"
      )))
    }
  }
  .map_err(|err| napi::Error::from_reason(err.to_string()))?;

  stream
    .play()
    .map_err(|err| napi::Error::from_reason(err.to_string()))?;

  ACTIVE_STREAM.with(|active| {
    *active.borrow_mut() = Some(stream);
  });

  Ok(())
}

#[napi]
pub fn stop_audio_capture() -> Result<()> {
  ACTIVE_STREAM.with(|active| {
    *active.borrow_mut() = None;
  });
  Ok(())
}
